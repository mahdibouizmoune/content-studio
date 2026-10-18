const { isSafeRemoteMediaUrl } = require('./media-security');

async function verifyPinterestLink(url, request, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  if (!url) return { valid: true, networkChecked: false, skipped: 'No destination supplied' };
  if (!isSafeRemoteMediaUrl(url)) return { valid: false, networkChecked: false, error: 'Destination must be a public URL.' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await request(url);
      const status = Number(response.status);
      const finalUrl = response.request?.res?.responseUrl || response.request?.responseURL || url;
      if (status !== 200) {
        const error = new Error(`Destination returned HTTP ${status}`);
        error.status = status;
        throw error;
      }
      return { valid: true, networkChecked: true, status, finalUrl, redirected: finalUrl !== url, attempts: attempt };
    } catch (error) {
      const status = Number(error.response?.status || error.status || 0);
      if (attempt < 3 && (!status || status >= 500 || status === 429)) { await sleep(attempt * 500); continue; }
      return { valid: false, networkChecked: true, status, attempts: attempt, error: error.message };
    }
  }
}

module.exports = { verifyPinterestLink };
