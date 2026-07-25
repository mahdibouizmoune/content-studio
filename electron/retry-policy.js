const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT'
]);

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isTransientNetworkError(error) {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.response?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return TRANSIENT_NETWORK_CODES.has(code)
    || TRANSIENT_HTTP_STATUSES.has(status)
    || message.includes('socket hang up')
    || message.includes('network error');
}

function retryAfterMs(error, attempt, { baseDelayMs = 1200, maxDelayMs = 8000 } = {}) {
  const retryAfter = error?.response?.headers?.['retry-after'];
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(maxDelayMs, Math.max(baseDelayMs, seconds * 1000));
  }
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

async function withTransientRetries(operation, {
  attempts = 3,
  baseDelayMs = 1200,
  maxDelayMs = 8000,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onRetry = () => {}
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientNetworkError(error)) throw error;
      const delayMs = retryAfterMs(error, attempt, { baseDelayMs, maxDelayMs });
      onRetry(error, attempt, delayMs);
      await wait(delayMs);
    }
  }
  throw lastError;
}

module.exports = {
  isTransientNetworkError,
  retryAfterMs,
  withTransientRetries
};
