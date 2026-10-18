const { createHash } = require('node:crypto');
async function publishOnce(job, { claim, finish, token, readImage, request, now = Date.now }) {
  const scheduled = Date.parse(job.scheduledAt);
  if (!Number.isFinite(scheduled)) throw new Error('Missing remote schedule.');
  if (scheduled > now()) return { status: 'not-due' };
  // Persist ownership before any external create call. An ambiguous result is never replayed.
  if (!await claim(job.id)) return { status: 'already-claimed' };
  try {
    if (now() - scheduled > 30 * 60000) { await finish(job.id, { status: 'missed' }); return; }
    const account = await request('https://api.pinterest.com/v5/user_account', { method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${token}` } });
    if (!account.ok) { await finish(job.id, { status: 'needs-credentials' }); return; }
    const profile = await account.json();
    const identity = `pinterest:${String(profile.id || profile.username || '').toLowerCase()}`;
    if (identity !== job.accountId) { await finish(job.id, { status: 'account-mismatch' }); return; }
    const bytes = await readImage(job.mediaUrl);
    if (createHash('sha256').update(bytes).digest('hex') !== job.mediaSha256) throw new Error('Hosted artwork changed; renewed review required.');
    const response = await request('https://api.pinterest.com/v5/pins', {
      method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: job.boardId, ...(job.sectionId ? { board_section_id: job.sectionId } : {}), title: job.title, description: job.description, alt_text: job.altText, link: job.destination, media_source: { source_type: 'image_url', url: job.mediaUrl }, ...(job.aiDisclosure ? { ai_disclosures: { values: ['AI_MODIFIED'] } } : {}) })
    });
    if (!response.ok) { await finish(job.id, { status: [400, 401, 402, 403, 404, 413, 415, 422, 429].includes(response.status) ? 'rejected' : 'uncertain', httpStatus: response.status }); return; }
    const result = await response.json();
    await finish(job.id, result.id ? { status: 'published', remoteId: String(result.id) } : { status: 'uncertain' });
  } catch { await finish(job.id, { status: 'uncertain' }); }
}
module.exports = { publishOnce };
