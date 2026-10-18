'use strict';
const { createHash } = require('node:crypto');
const path = require('node:path');
const words = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) || [];
function compareText(expected, observed, confidence) {
  const e = words(expected), o = words(observed), missing = [...new Set(e.filter(w => !o.includes(w)))], extra = [...new Set(o.filter(w => !e.includes(w)))];
  return { status: !e.length || !Number.isFinite(confidence) || confidence < 65 ? 'uncertain' : e.join(' ') !== o.join(' ') ? 'needs-review' : 'matched', expected, observed, confidence, missing, extra,
    limitation: 'OCR can miss stylized or small text. It cannot establish food realism; visually review final artwork.' };
}
function createTextChecker({ sharp, createWorker, langPath, cachePath }) {
  let tail = Promise.resolve();
  const cache = new Map();
  function check(bytes, expected) {
    const key = createHash('sha256').update(bytes).update(String(expected)).digest('hex');
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    const task = tail.then(async () => {
      if (cache.has(key)) return cache.get(key);
      const image = await sharp(bytes, { limitInputPixels: 40000000 }).resize({ width: 1200, withoutEnlargement: true }).png().toBuffer();
      const worker = await createWorker('eng', 1, { langPath, gzip: true, cachePath, workerPath: path.join(path.dirname(require.resolve('tesseract.js/package.json')), 'src/worker-script/node/index.js') });
      try {
        await worker.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '150' });
        let result = await worker.recognize(image);
        if (!result.data.text.trim() || result.data.confidence < 20) {
          const inverted = await sharp(image).grayscale().normalize().negate().png().toBuffer();
          const alternate = await worker.recognize(inverted);
          if (alternate.data.text.trim() && alternate.data.confidence > result.data.confidence) result = alternate;
        }
        const report = { ...compareText(expected, result.data.text, result.data.confidence), fingerprint: key, imageSha256: createHash('sha256').update(bytes).digest('hex'), checkedAt: new Date().toISOString() };
        cache.set(key, report); if (cache.size > 200) cache.delete(cache.keys().next().value); return report;
      } finally { await worker.terminate(); }
    });
    tail = task.catch(() => {}); return task;
  }
  return { check };
}
module.exports = { compareText, createTextChecker };
