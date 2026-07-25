const fs = require('fs');
const path = require('path');
const net = require('net');

function canonicalPath(value = '') {
  const resolved = path.resolve(String(value || ''));
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function comparablePath(value = '') {
  const canonical = canonicalPath(value);
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}

function isPathInsideRoots(target = '', roots = []) {
  if (!target) return false;
  const candidate = comparablePath(target);
  return (Array.isArray(roots) ? roots : [roots]).filter(Boolean).some((root) => {
    const allowed = comparablePath(root);
    return candidate === allowed || candidate.startsWith(`${allowed}${path.sep}`);
  });
}

function isSafeRemoteMediaUrl(value = '') {
  try {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.local')) return false;
    if (net.isIP(host) === 6) {
      if (host === '::' || host === '::1' || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) return false;
      if (/^::ffff:/i.test(host)) return false;
      return true;
    }
    if (/^0\./.test(host) || /^10\./.test(host) || /^127\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return false;
    const private172 = host.match(/^172\.(\d{1,3})\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    const carrierGradeNat = host.match(/^100\.(\d{1,3})\./);
    if (carrierGradeNat && Number(carrierGradeNat[1]) >= 64 && Number(carrierGradeNat[1]) <= 127) return false;
    if (/^198\.(18|19)\./.test(host) || /^(22[4-9]|23\d)\./.test(host) || /^(24\d|25[0-5])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function assertSafeRemoteRedirect(options = {}) {
  let redirectUrl = String(options.href || '').trim();
  if (!redirectUrl) {
    const protocol = String(options.protocol || 'https:');
    let hostname = String(options.hostname || options.host || '').trim();
    if (net.isIP(hostname) === 6 && !hostname.startsWith('[')) hostname = `[${hostname}]`;
    const port = options.port ? `:${options.port}` : '';
    redirectUrl = `${protocol}//${hostname}${port}${options.path || options.pathname || '/'}`;
  }
  if (!isSafeRemoteMediaUrl(redirectUrl)) {
    const error = new Error('Blocked a redirect to an unsafe remote media URL.');
    error.code = 'ERR_UNSAFE_REDIRECT';
    throw error;
  }
}

module.exports = {
  assertSafeRemoteRedirect,
  isPathInsideRoots,
  isSafeRemoteMediaUrl
};
