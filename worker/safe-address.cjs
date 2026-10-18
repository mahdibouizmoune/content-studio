const { isIP } = require('node:net');
function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  if (version === 6) {
    const v = address.toLowerCase();
    return /^2[0-9a-f]{3}:/.test(v) && !/^2001:(?:db8|0:|10:|20:)/.test(v) && !v.startsWith('2002:');
  }
  return false;
}
module.exports = { isPublicAddress };
