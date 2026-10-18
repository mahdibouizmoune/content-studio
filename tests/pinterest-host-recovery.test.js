const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizedHostname, resolvePinterestExportHost, findMatchingWordPressSite } = require('../electron/pinterest-hosting');
const { mediaExtension } = require('../electron/pinterest-export');

const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
const img = 'https://i.ibb.co/old/pin.jpg';
const wp = 'https://recipes.example/wp-content/uploads/pin.jpg';
const hash = 'a'.repeat(64);
const valid = { valid: true, sha256: hash, dimensionsVerified: true, width: 1000, height: 1500 };
const pin = { id: 'p1', title: 'Soup', url: 'https://recipes.example/soup', localPath: '/finished.jpg',
  imageSourceMode: 'generate-new', hostingProvider: 'imgbb', csvMediaUrl: img, hostedImageUrl: img, imgurUrl: img };
const configuredSite = { url: 'https://recipes.example', username: 'test', apiKey: 'mock-only' };

test('hosting selects the most specific WordPress installation and respects path boundaries and ports', () => {
  const blog = { ...configuredSite, url: 'https://recipes.example/blog' };
  const child = { ...configuredSite, url: 'https://recipes.example/blog/recipes' };
  assert.equal(findMatchingWordPressSite([configuredSite, blog, child], 'https://recipes.example/blog/recipes/soup'), child);
  assert.equal(findMatchingWordPressSite([blog], 'https://recipes.example/blogger/soup'), null);
  assert.equal(findMatchingWordPressSite([blog], 'https://recipes.example:8443/blog/soup'), null);
  assert.equal(findMatchingWordPressSite([blog], 'https://www.recipes.example/blog/soup'), blog);
});

function load(name, next, overrides = {}) {
  const context = {
    normalizedHostname, resolvePinterestExportHost, store: { get: () => ({}) }, mediaExtension, PIN_WIDTH: 1080, PIN_HEIGHT: 1920,
    hasPinterestDimensions: require('../electron/pinterest-delivery').hasPinterestDimensions,
    fs: { existsSync: () => true }, expectedPinterestImageIdentity: async () => ({ sha256: hash }),
    comparePinterestImageIdentity: (expected, actual) => ({ matches: expected.sha256 === actual.sha256, distance: 0 }),
    isTemporaryPinterestMediaUrl: () => false,
    validatePublicPinterestImage: async () => valid,
    ensurePinterestCsvJpeg: async (local) => { assert.equal(local, '/finished.jpg'); return '/export.jpg'; },
    hostFinalPinterestImage: async () => { throw new Error('Unexpected upload'); },
    downloadImage: async () => { throw new Error('Unexpected download'); },
    log: { warn: () => {} }, imgBBFailureMessage: () => 'ImgBB unavailable', ...overrides
  };
  vm.createContext(context);
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(`async function ${next}(`, start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(`${source.slice(start, end)}\nthis.run = ${name};`, context);
  return context.run;
}

test('recovery bypasses a locally reachable ImgBB URL and rehosts the finished image on WordPress', async () => {
  let uploaded = 0;
  const run = load('ensureDurablePinImage', 'generatePinImage', {
    hostFinalPinterestImage: async (local, destination, title, options) => {
      uploaded++;
      assert.equal(local, '/export.jpg');
      assert.equal(destination, pin.url);
      assert.equal(title, pin.title);
      assert.equal(options.mediaHost, 'wordpress');
      assert.equal(options.sourceMode, 'generate-new');
      assert.equal(options.requirePinterestDimensions, true);
      return { success: true, url: wp, provider: 'wordpress', validation: valid };
    }
  });
  assert.equal((await run(pin, { mediaHost: 'wordpress' })).url, wp);
  assert.equal(uploaded, 1);
});

test('automatic export migrates a reachable ImgBB image to the matching WordPress site', async () => {
  let uploaded = 0;
  const run = load('ensureDurablePinImage', 'generatePinImage', {
    store: { get: () => ({ wordpressSites: [configuredSite] }) },
    validatePublicPinterestImage: async () => { throw new Error('Do not retain ImgBB just because it is reachable'); },
    hostFinalPinterestImage: async (local, destination, title, options) => {
      uploaded++;
      assert.equal(local, '/export.jpg');
      assert.equal(destination, pin.url);
      assert.equal(options.mediaHost, 'wordpress');
      assert.equal(options.requirePinterestDimensions, true);
      return { success: true, url: wp, provider: 'wordpress', validation: valid };
    }
  });
  assert.equal((await run(pin)).url, wp);
  assert.equal(uploaded, 1);
});

test('automatic export does not silently return to ImgBB after WordPress fails', async () => {
  const run = load('ensureDurablePinImage', 'generatePinImage', {
    store: { get: () => ({ wordpressSites: [configuredSite] }) },
    hostFinalPinterestImage: async (_local, _destination, _title, options) => {
      assert.equal(options.mediaHost, 'wordpress');
      return { success: false, error: 'WordPress unavailable' };
    }
  });
  const result = await run(pin);
  assert.equal(result.success, false);
  assert.match(result.error, /WordPress unavailable/);
});

test('automatic export reuses verified WordPress media without uploading it again', async () => {
  const run = load('ensureDurablePinImage', 'generatePinImage', {
    store: { get: () => ({ wordpressSites: [configuredSite] }) }
  });
  assert.equal((await run({ ...pin, hostingProvider: 'wordpress', csvMediaUrl: wp, hostedImageUrl: wp })).url, wp);
});

test('automatic hosting never chooses another website or an unconfigured account', () => {
  assert.equal(resolvePinterestExportHost('auto', [configuredSite], pin.url), 'wordpress');
  assert.equal(resolvePinterestExportHost('auto', [configuredSite], 'https://other.example/soup'), 'auto');
  assert.equal(resolvePinterestExportHost('auto', [{ ...configuredSite, apiKey: '' }], pin.url), 'auto');
  assert.equal(resolvePinterestExportHost('auto', [], pin.url), 'auto');
  assert.equal(resolvePinterestExportHost('wordpress', [], pin.url), 'wordpress');
  assert.equal(resolvePinterestExportHost('resilient', [], pin.url), 'resilient');
});

test('resilient hosting tries ImgBB first and falls back to matching WordPress media', async () => {
  const calls = [];
  const run = load('hostFinalPinterestImage', 'expectedPinterestImageIdentity', {
    uploadLocalImageToImgBB: async () => { calls.push('imgbb'); return null; },
    uploadPinterestImageToWordPress: async () => {
      calls.push('wordpress');
      return { success: true, url: wp, provider: 'wordpress', validation: valid };
    }
  });
  const result = await run('/finished.jpg', pin.url, pin.title, { mediaHost: 'resilient', sourceMode: 'generate-new' });
  assert.equal(result.success, true);
  assert.equal(result.url, wp);
  assert.deepEqual(calls, ['imgbb', 'wordpress']);
});

test('WordPress batch verification is bounded and preserves all twenty rows', async () => {
  let handler;
  let active = 0;
  let maximum = 0;
  const context = vm.createContext({
    pinterestBatches: () => [],
    schedulePinterestPins: require('../electron/pinterest-schedule').schedulePinterestPins,
    store: { get: () => ({ wordpressSites: [configuredSite] }) }, resolvePinterestExportHost,
    secureIpcHandle: (_channel, callback) => { handler = callback; },
    ensureDurablePinImage: async (item) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return { success: true, provider: 'wordpress', url: `https://recipes.example/${item.id}.jpg`, validation: { ...valid, identityVerified: true } };
    }
  });
  const start = source.indexOf("secureIpcHandle('prepare-pinterest-export',");
  const end = source.indexOf("secureIpcHandle('validate-pinterest-export',", start);
  vm.runInContext(source.slice(start, end), context);
  const pins = Array.from({ length: 20 }, (_, i) => ({ ...pin, id: String(i+1) }));
  const result = await handler({}, { pins });
  assert.equal(result.success, true);
  assert.equal(result.pins.length, 20);
  assert.equal(maximum, 4);
  assert.deepEqual(Array.from(result.pins, item => item.id), pins.map(item => item.id));
});

test('automatic export keeps the recovered WordPress URL ahead of historical ImgBB URLs', async () => {
  const run = load('ensureDurablePinImage', 'generatePinImage');
  const result = await run({ ...pin, hostingProvider: 'wordpress', csvMediaUrl: wp, hostedImageUrl: wp });
  assert.equal(result.url, wp);
  assert.equal(result.provider, 'wordpress');
  assert.equal(result.validation.identityVerified, true);
});

test('repeating WordPress recovery reuses the verified finished asset without another upload', async () => {
  const run = load('ensureDurablePinImage', 'generatePinImage');
  const result = await run({ ...pin, hostingProvider: 'wordpress', csvMediaUrl: wp, hostedImageUrl: wp }, { mediaHost: 'wordpress' });
  assert.equal(result.url, wp);
});

for (const expected of [{}, { sha256: 'b'.repeat(64) }]) {
  test(`recovery cannot substitute an unverified remote image (${expected.sha256 ? 'mismatch' : 'no identity'})`, async () => {
    const run = load('ensureDurablePinImage', 'generatePinImage', {
      fs: { existsSync: () => false }, expectedPinterestImageIdentity: async () => expected
    });
    const result = await run({ ...pin, localPath: '' }, { mediaHost: 'wordpress' });
    assert.equal(result.success, false);
    assert.match(result.error, /Regenerate/);
  });
}

test('explicit WordPress failure never silently falls back to ImgBB', async () => {
  let attempts = 0;
  const run = load('hostFinalPinterestImage', 'expectedPinterestImageIdentity', {
    uploadPinterestImageToWordPress: async () => { attempts++; return { success: false, error: 'WordPress unavailable' }; },
    uploadLocalImageToImgBB: async () => { throw new Error('Must not fall back'); }
  });
  const result = await run('/finished.jpg', pin.url, pin.title, { mediaHost: 'wordpress' });
  assert.equal(result.success, false);
  assert.match(result.error, /WordPress unavailable/);
  assert.equal(attempts, 1);
});

test('recovery checks the downloaded bytes and rejects media changed after the validation GET', async () => {
  for (const changed of [false, true]) {
    let uploaded = 0;
    const run = load('ensureDurablePinImage', 'generatePinImage', {
      fs: { existsSync: () => false },
      expectedPinterestImageIdentity: async (item) => ({ sha256: changed && item.localPath === '/downloaded.jpg' ? 'b'.repeat(64) : hash }),
      downloadImage: async () => '/downloaded.jpg',
      ensurePinterestCsvJpeg: async (local) => { assert.equal(local, '/downloaded.jpg'); return '/export.jpg'; },
      hostFinalPinterestImage: async () => { uploaded++; return { success: true, url: wp }; }
    });
    const result = await run({ ...pin, localPath: '' }, { mediaHost: 'wordpress' });
    assert.equal(result.success, !changed);
    assert.equal(uploaded, changed ? 0 : 1);
  }
});

test('WordPress recovery rejects a hosted image whose fingerprint differs from the finished Pin', async () => {
  const run = load('hostFinalPinterestImage', 'expectedPinterestImageIdentity', {
    sharp: () => ({ metadata: async () => ({ width: 1000, height: 1500 }) }),
    assertAllowedMediaPath: (value) => value,
    fsp: { readFile: async () => Buffer.from('finished') },
    createHash: () => ({ update: () => ({ digest: () => hash }) }),
    perceptualHash: async () => 'a'.repeat(16),
    uploadPinterestImageToWordPress: async () => ({ success: true, url: wp, validation: { ...valid, sha256: 'b'.repeat(64) } })
  });
  const result = await run('/finished.jpg', pin.url, pin.title, { mediaHost: 'wordpress', requirePinterestDimensions: true });
  assert.equal(result.success, false);
  assert.match(result.error, /did not visually match/);
});
