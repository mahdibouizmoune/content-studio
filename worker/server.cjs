const fs = require('node:fs/promises');
const https = require('node:https');
const dns = require('node:dns');
const { Pool } = require('pg');
const { PgBoss } = require('pg-boss');
const { verify, sign, validateJob, key, publicHttps } = require('./protocol.cjs');
const { publishOnce } = require('./publish.cjs');
const { isPublicAddress } = require('./safe-address.cjs');
function readImage(url) {
  if (!publicHttps(url)) return Promise.reject(new Error('Invalid media host.'));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 30000, lookup: (host, options, callback) => dns.lookup(host, { ...options, all: true }, (error, addresses) => {
      if (error || !addresses?.length || addresses.some(a => !isPublicAddress(a.address))) return callback(new Error('Non-public media address blocked.'));
      if (options.all) callback(null, addresses); else callback(null, addresses[0].address, addresses[0].family);
    }) }, response => {
      if (response.statusCode !== 200 || !/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers['content-type'] || '')) { response.resume(); reject(new Error('Public image unavailable.')); return; }
      const chunks = []; let size = 0;
      response.on('data', bytes => { size += bytes.length; if (size > 30 * 1024 * 1024) { response.destroy(new Error('Image too large.')); return; } chunks.push(bytes); });
      response.on('error', reject); response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', reject); request.on('timeout', () => request.destroy(new Error('Media download timed out.')));
  });
}
async function main() {
  const secret = key(process.env.WORKER_SIGNING_SECRET);
  if (!process.env.DATABASE_URL) throw new Error('Configure a dedicated PostgreSQL DATABASE_URL.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
  boss.on('error', () => console.error('Worker queue error. Check PostgreSQL availability.'));
  await pool.query('CREATE TABLE IF NOT EXISTS cs_remote_pins (id text PRIMARY KEY, payload jsonb NOT NULL, state text NOT NULL, result jsonb, updated_at timestamptz NOT NULL DEFAULT now())');
  if (process.argv[2] === 'receipt') {
    const { rows } = await pool.query('SELECT id, state, result, updated_at FROM cs_remote_pins ORDER BY updated_at DESC LIMIT 10000');
    await fs.writeFile(process.argv[3] || 'worker-receipt.json', JSON.stringify(sign({ type: 'receipt', rows, createdAt: new Date().toISOString() }, secret)), { flag: 'wx', mode: 0o600 }); await pool.end(); return;
  }
  await boss.start(); await boss.createQueue('publish-pin', { retryLimit: 0, expireInSeconds: 180 });
  if (process.argv[2] === 'import') {
    const input = process.argv[3]; if (!input || (await fs.stat(input)).size > 2 * 1024 * 1024) throw new Error('Provide a signed batch smaller than 2 MB.');
    const batch = verify(JSON.parse(await fs.readFile(input, 'utf8')), secret);
    if (batch.type !== 'approved-pins' || !Array.isArray(batch.jobs) || batch.jobs.length > 500) throw new Error('Invalid approved batch.');
    for (const p of batch.jobs) validateJob(p);
    for (const p of batch.jobs) {
      await pool.query("INSERT INTO cs_remote_pins(id,payload,state) VALUES($1,$2,'queued') ON CONFLICT(id) DO NOTHING", [p.id, p]);
      const { rows } = await pool.query('SELECT payload,state FROM cs_remote_pins WHERE id=$1', [p.id]);
      if (JSON.stringify(rows[0].payload) !== JSON.stringify(JSON.parse(JSON.stringify(p)))) {
        // jsonb key order is not stable; compare the immutable serialized payload digest instead.
        if (validateJob(rows[0].payload, Date.parse(p.scheduledAt) - 120000) !== validateJob(p, Date.parse(p.scheduledAt) - 120000)) throw new Error('Existing job ID has different content.');
      }
    }
    console.log(`Stored ${batch.jobs.length} approved jobs. Start the worker to dispatch them.`); await boss.stop(); await pool.end(); return;
  }
  if (process.env.ENABLE_PINTEREST_PUBLISHING !== 'true') throw new Error('Worker is off. Set ENABLE_PINTEREST_PUBLISHING=true only after approved Pinterest API access and a staging check.');
  const tokens = JSON.parse(process.env.PINTEREST_ACCOUNT_TOKENS || '{}');
  const enqueue = async () => {
    const { rows } = await pool.query("SELECT id,payload FROM cs_remote_pins WHERE state='queued' AND (payload->>'scheduledAt')::timestamptz <= now() LIMIT 100");
    for (const row of rows) await boss.send('publish-pin', row.payload, { singletonKey: row.id, singletonSeconds: 60, retryLimit: 0 });
  };
  await boss.work('publish-pin', { batchSize: 1 }, async ([job]) => {
    if (!tokens[job.data.accountId]) { await pool.query("UPDATE cs_remote_pins SET state='needs-credentials',updated_at=now() WHERE id=$1 AND state='queued'", [job.data.id]); return; }
    await publishOnce(job.data, {
      token: tokens[job.data.accountId], readImage,
      request: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(45000) }),
      claim: async id => (await pool.query("UPDATE cs_remote_pins SET state='attempting',updated_at=now() WHERE id=$1 AND state='queued' RETURNING id", [id])).rowCount === 1,
      finish: (id, result) => pool.query('UPDATE cs_remote_pins SET state=$2,result=$3,updated_at=now() WHERE id=$1', [id, result.status, result])
    });
  });
  await enqueue(); const timer = setInterval(() => enqueue().catch(() => console.error('Dispatch scan failed.')), 15000);
  const stop = async () => { clearInterval(timer); await boss.stop(); await pool.end(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  console.log('Remote publisher running. Uncertain/attempting jobs require manual reconciliation; no automatic create replay.');
}
main().catch(() => { console.error('Worker stopped. Check configuration, signed batch and database. No automatic publish retry was attempted.'); process.exitCode = 1; setTimeout(() => process.exit(1), 1000).unref(); });
