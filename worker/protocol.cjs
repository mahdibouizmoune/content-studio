const { createHmac, timingSafeEqual, createHash } = require('node:crypto');
const { isIP } = require('node:net');
function key(value) { if (Buffer.byteLength(String(value || '')) < 32) throw new Error('Use a separate random worker signing secret of at least 32 characters.'); return String(value); }
function sign(payload, secret) { const body = JSON.stringify(payload); return { body, signature: createHmac('sha256', key(secret)).update(body).digest('hex') }; }
function verify(envelope, secret) {
  if (typeof envelope.body !== 'string' || envelope.body.length > 2 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(envelope.signature || '')) throw new Error('Invalid signed worker envelope.');
  const expected = createHmac('sha256', key(secret)).update(envelope.body).digest();
  if (!timingSafeEqual(expected, Buffer.from(envelope.signature, 'hex'))) throw new Error('Worker signature mismatch.');
  return JSON.parse(envelope.body);
}
function publicHttps(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash && !isIP(u.hostname.replace(/[\[\]]/g, '')) && u.hostname.includes('.') && !/\.(local|localhost|internal|test|invalid)$/i.test(u.hostname); } catch { return false; }
}
function stable(value) { return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item); }
function validateJob(p, now = Date.now()) {
  if (!/^[\w-]{1,100}$/.test(p.id || '') || !p.accountId || !p.approval?.fingerprint || p.approval.version !== p.version || p.channel !== 'remote') throw new Error('Current explicit approval is required.');
  if (!p.title?.trim() || p.title.length > 100 || typeof p.description !== 'string' || p.description.length > 800 || typeof p.altText !== 'string' || p.altText.length > 500 || !/^\d+$/.test(p.boardId)) throw new Error('Invalid Pin metadata or board.');
  if (!publicHttps(p.destination) || !publicHttps(p.mediaUrl) || /(^|\.)replicate\.(com|delivery)$/.test(new URL(p.mediaUrl).hostname) || !/^[a-f0-9]{64}$/.test(p.mediaSha256 || '')) throw new Error('A durable verified HTTPS image and destination are required.');
  const time = Date.parse(p.scheduledAt);
  if (!Number.isFinite(time) || time < now + 60000 || time > now + 30 * 86400000) throw new Error('Schedule the remote Pin at least one minute ahead and within 30 days.');
  return createHash('sha256').update(stable(p)).digest('hex');
}
module.exports = { sign, verify, key, publicHttps, validateJob, stable };
