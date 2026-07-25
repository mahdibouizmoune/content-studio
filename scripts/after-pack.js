const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const pe = require('pe-library');
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
  const appAsar = path.join(context.appOutDir, 'resources', 'app.asar');
  if (!fs.existsSync(appAsar)) return;

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'content-studio-asar-'));
  try {
    await asar.extractAll(appAsar, tempDir);
    const electronDir = path.join(tempDir, 'electron');
    if (fs.existsSync(electronDir)) {
      const electronFiles = await walk(electronDir);
      for (const filePath of electronFiles.filter((file) => file.endsWith('.js'))) {
        await obfuscateFile(filePath, { renameGlobals: true, reservedNames: [] });
      }
    }

    const distAssetsDir = path.join(tempDir, 'dist', 'assets');
    if (fs.existsSync(distAssetsDir)) {
      const assets = await walk(distAssetsDir);
      for (const filePath of assets.filter((file) => file.endsWith('.js'))) {
        await obfuscateFile(filePath, { renameGlobals: true });
      }
    }

    await fsp.rm(appAsar, { force: true });
    await asar.createPackageWithOptions(tempDir, appAsar, {
      unpackDir: 'node_modules/{sharp,@img}'
    });
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  await obfuscateAppAsar(context);

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
  res.outputResource(exe);
  await writeFileWithRetry(exePath, Buffer.from(exe.generate()));
};
