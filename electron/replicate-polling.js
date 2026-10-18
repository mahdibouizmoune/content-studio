function createReplicatePoller({ get, cancel, delay }) {
  return async function poll(predictionId, apiToken, { maxAttempts = 60, intervalMs = 5000, signal, preserveOutput = false, onProgress } = {}) {
    const url = `https://api.replicate.com/v1/predictions/${encodeURIComponent(predictionId)}`;
    let terminal = false;
    let readFailures = 0;
    let cancellation;
    const stop = () => (cancellation ||= Promise.resolve().then(() => cancel(`${url}/cancel`, apiToken)).catch(() => {}));
    const onAbort = () => { void stop(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted) throw new Error('Cancelled by user');
        await delay(intervalMs, signal);
        let response;
        try {
          response = await get(url, { headers: { Authorization: `Bearer ${apiToken}` }, timeout: 30000, signal });
          readFailures = 0;
        } catch (error) {
          if (signal?.aborted) throw new Error('Cancelled by user');
          const status = error.response?.status;
          if ((!status || status === 429 || status >= 500) && ++readFailures < 3) continue;
          error.noRetry = true;
          throw error;
        }
        const prediction = response.data || {};
        terminal = ['succeeded', 'failed', 'canceled'].includes(prediction.status);
        try { onProgress?.({ predictionId, status: prediction.status, attempt: attempt + 1, maxAttempts }); } catch { /* A closed progress view must not discard paid results. */ }
        if (prediction.status === 'succeeded') return preserveOutput ? prediction.output : Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;
        if (prediction.status === 'failed') throw new Error(`Prediction failed: ${prediction.error || 'Unknown'}`);
        if (prediction.status === 'canceled') { const error = new Error('Prediction canceled'); error.noRetry = true; throw error; }
      }
      const error = new Error('Prediction timed out. The existing prediction was stopped; it was not submitted again.');
      error.noRetry = true;
      throw error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (!terminal) await stop();
    }
  };
}

module.exports = { createReplicatePoller };
