const { execFileSync } = require('node:child_process');

function assertSignatures(results) {
  if (!Array.isArray(results) || !results.length || results.some((item) => item.status !== 'Valid' || !item.signer)) {
    throw new Error('Release blocked: every Windows installer must have a valid publisher signature. Configure code signing, or use CONTENT_STUDIO_ALLOW_UNSIGNED=1 only for a local test build.');
  }
}

async function verifyReleaseSignatures(buildResult) {
  const macArtifacts = (buildResult.artifactPaths || []).filter(file => /\.dmg$/i.test(file));
  if (macArtifacts.length && process.env.CONTENT_STUDIO_ALLOW_UNSIGNED !== '1') {
    if (process.platform !== 'darwin') throw new Error('Signed Mac releases must be verified on macOS.');
    for (const file of macArtifacts) execFileSync('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', file], { stdio: 'pipe' });
  }
  if (macArtifacts.length && process.env.CONTENT_STUDIO_ALLOW_UNSIGNED === '1' && !macArtifacts.every(file => /unsigned[ -]test/i.test(file))) throw new Error('Unsigned Mac test artifacts must include UNSIGNED TEST in their filename.');
  const artifacts = (buildResult.artifactPaths || []).filter((file) => /\.(exe|msi|msix|appx)$/i.test(file));
  if (!artifacts.length) return [];
  if (process.env.CONTENT_STUDIO_ALLOW_UNSIGNED === '1') {
    if (!artifacts.every((file) => /unsigned[ -]test/i.test(file))) {
      throw new Error('Unsigned local builds must include UNSIGNED TEST in every installer filename.');
    }
    console.warn('UNSIGNED LOCAL TEST BUILD: not a signed distribution release.');
    return [];
  }
  if (process.platform !== 'win32') throw new Error('Windows release signatures must be verified on Windows before distribution.');
  const encoded = Buffer.from(JSON.stringify(artifacts), 'utf8').toString('base64');
  const command = `$ErrorActionPreference='Stop'; $files=([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json); $results=@($files | ForEach-Object { $s=Get-AuthenticodeSignature -LiteralPath $_; @{ path=$_; status=[string]$s.Status; signer=[string]$s.SignerCertificate.Subject } }); ConvertTo-Json -InputObject $results -Compress`;
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
  assertSignatures(JSON.parse(output.trim()));
  return [];
}

module.exports = verifyReleaseSignatures;
module.exports.assertSignatures = assertSignatures;
