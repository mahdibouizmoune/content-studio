const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const pe = require('pe-library');
const plist = require('plist');
const ResEdit = require('resedit');
const asar = require('@electron/asar');
const JavaScriptObfuscator = require('javascript-obfuscator');

async function walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function obfuscateFile(filePath, { renameGlobals = true, reservedNames = [] } = {}) {
  if (!fs.existsSync(filePath)) return;
  const input = await fsp.readFile(filePath, 'utf8');
  const output = JavaScriptObfuscator.obfuscate(input, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals,
    reservedNames,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  }).getObfuscatedCode();
  await fsp.writeFile(filePath, output, 'utf8');
}

async function writeFileWithRetry(filePath, data, attempts = 8) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fsp.writeFile(filePath, data);
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN'].includes(error.code) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
  }
  throw lastError;
}

async function obfuscateAppAsar(context) {
  const resourcesDir = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const appAsar = path.join(resourcesDir, 'app.asar');
  if (!fs.existsSync(appAsar)) return null;

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'content-studio-asar-'));
  try {
    await asar.extractAll(appAsar, tempDir);
    const electronDir = path.join(tempDir, 'electron');
    if (fs.existsSync(electronDir)) {
      const electronFiles = await walk(electronDir);
      for (const filePath of electronFiles.filter((file) => /\.(?:js|mjs)$/.test(file))) {
        await obfuscateFile(filePath, { renameGlobals: !filePath.endsWith('.mjs'), reservedNames: [] });
      }
    }

    const distAssetsDir = path.join(tempDir, 'dist', 'assets');
    if (fs.existsSync(distAssetsDir)) {
      const assets = await walk(distAssetsDir);
      for (const filePath of assets.filter((file) => file.endsWith('.js'))) {
        await obfuscateFile(filePath, { renameGlobals: true });
      }
    }

    const packagedFiles = await walk(tempDir);
    await Promise.all(packagedFiles
      .filter((filePath) => filePath.endsWith('.map'))
      .map((filePath) => fsp.rm(filePath, { force: true })));

    await fsp.rm(appAsar, { force: true });
    await asar.createPackageWithOptions(tempDir, appAsar, {
      unpackDir: 'node_modules/{sharp,@img,tesseract.js,tesseract.js-core,@tesseract.js-data}'
    });
    const { headerString } = asar.getRawHeader(appAsar);
    return {
      appAsar,
      hash: crypto.createHash('sha256').update(headerString).digest('hex')
    };
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

async function updateMacAsarIntegrity(context, hash) {
  const appBundle = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const infoPath = path.join(appBundle, 'Contents', 'Info.plist');
  if (!fs.existsSync(infoPath) || !hash) return;
  const info = plist.parse(await fsp.readFile(infoPath, 'utf8'));
  info.ElectronAsarIntegrity = {
    'Resources/app.asar': { algorithm: 'SHA256', hash }
  };
  await fsp.writeFile(infoPath, plist.build(info), 'utf8');
}

function updateWindowsAsarIntegrity(entries, hash, language = 1033) {
  if (!hash) return;
  const payload = Buffer.from(JSON.stringify([{
    file: 'resources\\app.asar',
    alg: 'SHA256',
    value: hash
  }]));
  const existing = entries.find((entry) => (
    String(entry.type).toUpperCase() === 'INTEGRITY'
    && String(entry.id).toUpperCase() === 'ELECTRONASAR'
  ));
  if (existing) {
    existing.bin = payload;
    return;
  }
  entries.push({ type: 'INTEGRITY', id: 'ELECTRONASAR', bin: payload, lang: language, codepage: 1200 });
}

exports.default = async function afterPack(context) {
  // Obfuscate application-owned JavaScript on every packaged platform. Native
  // dependencies remain unpacked so Sharp can load normally.
  const integrity = await obfuscateAppAsar(context);

  if (context.electronPlatformName === 'darwin') {
    await updateMacAsarIntegrity(context, integrity?.hash);
    return;
  }

  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'build-resources', 'icon.ico');
  if (!fs.existsSync(exePath) || !fs.existsSync(iconPath)) return;

  const exe = pe.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = pe.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const group = groups[0] || { id: 1, lang: 1033 };
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    group.id,
    group.lang || 1033,
    iconFile.icons.map((item) => item.data)
  );
  updateWindowsAsarIntegrity(res.entries, integrity?.hash, group.lang || 1033);
  res.outputResource(exe);
  await writeFileWithRetry(exePath, Buffer.from(exe.generate()));
};
