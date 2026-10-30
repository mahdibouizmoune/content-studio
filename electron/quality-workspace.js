'use strict';
const { randomUUID, createHash } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { inspectRecipe, extractRecipeData, shoppingHtml } = require('./recipe-quality');
const { createTextChecker } = require('./pin-text-check');
const { renderExactTemplate } = require('./exact-pin-template');
const { analyticsConfig } = require('./google-analytics');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function createQualityWorkspace({ store, ledger, readMedia, sharp, mediaDirectory, displayUrl, cachePath, saveFile, fetchPage, refreshEvents, pluginFiles, releaseInfo, encrypt, decrypt, readPublicImage, readReceipt, workerFiles, readModelMetadata, readArchive, readiness }) {
  const operations = require('./content-operations').createContentOperations({ store, ledger, saveFile, readMedia, readArchive, readiness });
  let checker;
  const get = () => ({ reports: {}, collections: [], ...store.get('qualityWorkspace', {}) });
  const save = d => store.set('qualityWorkspace', d);
  const articles = () => store.get('articles', []);
  const pins = () => store.get('pinCreatorPins', []);
  function pin(id) { const p = pins().find(p => p.id === id); if (!p) throw new Error('This Pin is no longer saved.'); return p; }
  async function artwork(id) { const p = pin(id), bytes = await readMedia(p); return { p, bytes, sha: digest(bytes) }; }
  function updatePin(p, sha, patch) {
    const current = pin(p.id);
    if (current.localPath !== p.localPath || current.imageUrl !== p.imageUrl || current.imageQa?.sha256 !== p.imageQa?.sha256) throw new Error('Artwork changed during review; check the new image.');
    const next = { ...current, imageQa: { ...current.imageQa, ...patch, reviewSha256: sha } };
    store.set('pinCreatorPins', pins().map(p => p.id === next.id ? next : p)); return next;
  }
  async function run(action, params = {}) {
    if (typeof action === 'string' && action.startsWith('content:')) return operations.run(action.slice(8), params);
    switch (action) {
      case 'model-readiness': {
        if (!/^[a-z0-9][a-z0-9_-]{0,80}\/[a-z0-9][a-z0-9._-]{0,100}$/i.test(params.model || '')) throw new Error('Enter a provider model name as owner/model.');
        if (!readModelMetadata) throw new Error('Model metadata checks are unavailable in this build.');
        const metadata = await readModelMetadata(params.model);
        const input = metadata?.latest_version?.openapi_schema?.components?.schemas?.Input;
        return { model: params.model, checkedAt: new Date().toISOString(), version: metadata?.latest_version?.id || null, status: input?.properties ? 'metadata-available' : 'input-schema-unavailable', requiredInputs: input?.required || [], inputNames: Object.keys(input?.properties || {}), paidPredictionsSubmitted: 0, limitation: 'Metadata access does not prove output quality, price or prediction availability.' };
      }
      case 'snapshot': {
        const d = get(); let config = {}, analyticsError = '';
        try { config = analyticsConfig(store.get('settings', {})); } catch (error) { analyticsError = error.message; }
        d.reports = Object.fromEntries(articles().flatMap(a => {
          const r = d.reports[a.id] || a.recipeQuality;
          return r ? [[a.id, r.contentSha256 === digest(Buffer.from(a.content || '')) ? r : { ...r, status: 'outdated', issues: [{ severity: 'warning', message: 'Article changed after this check. Check it again.' }] }]] : [];
        }));
        const events = d.events && d.events.propertyId === config.propertyId && d.events.siteUrl === config.siteUrl ? d.events : null;
        const workspace = store.get('pinWorkspace', {});
        return { ...d, events, analyticsError, workerPaired: Boolean(store.get('qualityWorkerSigningSecret', '')), workerDrafts: (workspace.drafts || []).filter(p => ['approved', 'remote_pending', 'reconciling'].includes(p.state)).map(p => ({ id: p.id, title: p.title, state: p.state })), spending: ledger.summary(), release: releaseInfo(), articles: articles().map(a => ({ id: a.id, title: a.generatedTitle || a.title, status: a.status })), pins: pins().map(p => ({ id: p.id, title: p.title, displayUrl: p.displayUrl || p.imageUrl, imageQa: p.imageQa, localPath: p.localPath, imageSourceMode: p.imageSourceMode })) };
      }
      case 'inspect-recipes': {
        const chosen = new Set(params.ids || []), d = get();
        const selected = articles().filter(a => chosen.has(a.id));
        if (!selected.length) throw new Error('Select at least one saved article.');
        for (const article of selected) d.reports[article.id] = inspectRecipe(article);
        save(d); return { count: selected.length };
      }
      case 'collection-save': {
        const d = get(), name = String(params.name || '').trim().slice(0, 120), ids = [...new Set(params.ids || [])].filter(id => articles().some(a => a.id === id));
        if (!name || !ids.length) throw new Error('Choose a collection name and saved recipes.');
        const collection = { id: params.id || randomUUID(), name, ids, updatedAt: new Date().toISOString() };
        d.collections = [collection, ...d.collections.filter(c => c.id !== collection.id)]; save(d); return collection;
      }
      case 'collection-delete': { const d = get(); d.collections = d.collections.filter(c => c.id !== params.id); save(d); return {}; }
      case 'shopping-list': {
        const selected = articles().filter(a => (params.ids || []).includes(a.id));
        if (!selected.length) throw new Error('Select recipes first.');
        return saveFile('recipe-shopping-list.html', Buffer.from(shoppingHtml(selected, Number(params.multiplier ?? 1))), [{ name: 'Printable Shopping List', extensions: ['html'] }]);
      }
      case 'source-recipe': {
        const result = await fetchPage(String(params.url || ''));
        if (result.status && (result.status < 200 || result.status >= 300)) throw new Error(`Recipe source returned HTTP ${result.status}. No recipe was imported.`);
        const recipes = extractRecipeData(result.html, result.url || result.finalUrl || params.url);
        return { recipes };
      }
      case 'check-text': {
        const expected = String(params.expected || '').trim();
        if (!expected || expected.length > 160) throw new Error('Enter the exact visible headline, including any button text (up to 160 characters).');
        const { p, bytes, sha } = await artwork(params.id);
        if (!checker) {
          const { createWorker } = require('tesseract.js'); const { langPath } = require('@tesseract.js-data/eng');
          await fs.mkdir(cachePath, { recursive: true });
          checker = createTextChecker({ sharp, createWorker, langPath, cachePath });
        }
        const report = await checker.check(bytes, expected);
        const current = await artwork(params.id); if (current.sha !== sha) throw new Error('Artwork changed during OCR; check it again.');
        return { pin: updatePin(p, sha, { textCheck: report }) };
      }
      case 'import-photo': {
        const bytes = await readMedia({ localPath: String(params.localPath || '') });
        const meta = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
        const id = randomUUID(), p = { id, title: 'Imported Photograph', description: '', url: '', localPath: params.localPath, displayUrl: displayUrl(params.localPath), imageUrl: displayUrl(params.localPath), status: 'ready', imageSourceMode: 'reuse-article', sourceKind: 'local-photo', imageQa: { sha256: digest(bytes), width: meta.width, height: meta.height, overlayVerified: false } };
        store.set('pinCreatorPins', [p, ...pins()]); return { pin: p };
      }
      case 'visual-review': {
        const { p, sha } = await artwork(params.id);
        if (params.sha256 && params.sha256 !== sha) throw new Error('Image changed since your text check; reopen and review it.');
        return { pin: updatePin(p, sha, { visualReview: { status: params.approved === true ? 'reviewed' : 'needs-review', imageSha256: sha, checkedAt: new Date().toISOString() } }) };
      }
      case 'exact-template': {
        const { p, bytes } = await artwork(params.id);
        if (p.imageSourceMode !== 'reuse-article' && p.imageQa?.overlayVerified !== false && params.cleanPhotoConfirmed !== true) throw new Error('Use a clean photograph. Confirm it has no existing lettering before adding another headline.');
        if (params.cleanPhotoConfirmed !== true) throw new Error('Confirm the selected photo contains no lettering.');
        const ratio = params.ratio || '9:16';
        if (!['9:16', '2:3'].includes(ratio)) throw new Error('Choose 9:16 or 2:3 portrait.');
        const [width, height] = ratio === '2:3' ? [1000, 1500] : [1080, 1920];
        const output = await renderExactTemplate({ sharp, bytes, width, height, text: String(params.text || ''), placement: params.placement, fontData: await fs.readFile(path.join(__dirname, 'assets/fonts/Montserrat-Bold.ttf')) });
        const id = randomUUID(), localPath = path.join(mediaDirectory(), `exact-pin-${id}.jpg`); await fs.writeFile(localPath, output, { flag: 'wx' });
        const next = { id, title: p.title, description: p.description, url: p.url, board: p.board, csvBoard: p.csvBoard, interests: p.interests, articleId: p.articleId, sourceSnapshot: p.sourceSnapshot,
          localPath, displayUrl: displayUrl(localPath), imageUrl: displayUrl(localPath), imageSourceMode: p.imageSourceMode,
          status: 'completed', createdAt: new Date().toISOString(), style: 'local-exact-template', expectedOverlayText: String(params.text),
          imageQa: { sha256: digest(output), dimensionsVerified: true, width, height, overlayVerified: true, safeZoneVerified: true }, templateSourcePinId: p.id };
        store.set('pinCreatorPins', [next, ...pins()]); return { pin: next };
      }
      case 'spending-configure': return ledger.configure(params);
      case 'spending-reconcile': return ledger.reconcile(params);
      case 'events-refresh': {
        const events = await refreshEvents(); const d = get(); d.events = events; save(d); return events;
      }
      case 'reader-plugin': {
        const JSZip = require('jszip'), zip = new JSZip();
        for (const [name, bytes] of await pluginFiles()) zip.file(`content-studio-reader/${name}`, bytes);
        return saveFile('content-studio-reader.zip', await zip.generateAsync({ type: 'nodebuffer' }), [{ name: 'WordPress Plugin', extensions: ['zip'] }]);
      }
      case 'worker-pair': {
        require('../worker/protocol.cjs').key(params.secret);
        const active = (store.get('pinWorkspace', {}).drafts || []).some(p => p.remoteHandoff && !['published', 'rejected', 'missed', 'account-mismatch'].includes(p.remoteHandoff.status));
        if (active) throw new Error('Keep the current worker key until all handed-off jobs are reconciled.');
        store.set('qualityWorkerSigningSecret', encrypt(params.secret)); return {};
      }
      case 'worker-package': {
        const JSZip = require('jszip'), zip = new JSZip();
        for (const [name, bytes] of await workerFiles()) zip.file(`content-studio-worker/${name}`, bytes);
        return saveFile('content-studio-optional-worker.zip', await zip.generateAsync({ type: 'nodebuffer' }), [{ name: 'Optional Server Worker', extensions: ['zip'] }]);
      }
      case 'worker-bundle': {
        const { sign, validateJob } = require('../worker/protocol.cjs');
        const { fingerprint } = require('./pin-workspace');
        const secret = decrypt(store.get('qualityWorkerSigningSecret', ''));
        const d = store.get('pinWorkspace', {}), chosen = (d.drafts || []).filter(p => (params.ids || []).includes(p.id));
        if (!chosen.length || chosen.length > 500) throw new Error('Select 1 to 500 explicitly approved workspace Pins.');
        const jobs = [];
        for (const p of chosen) {
          if (p.state !== 'approved' || p.approval?.version !== p.version || p.approval?.fingerprint !== fingerprint(p) || (d.jobs || []).some(j => j.draftId === p.id && ['queued', 'scheduled', 'publishing', 'retry_wait', 'reconciling'].includes(j.status))) throw new Error('Remote handoff requires fresh approval and no active local job.');
          const asset = (d.assets || []).find(a => a.id === p.assetId);
          if (!asset || asset.kind === 'video' || (asset.provenance === 'ai' && !p.aiDisclosure)) throw new Error('Choose an approved image with the required AI disclosure.');
          const mediaUrl = params.mediaUrls?.[p.id] || asset.publicUrl || asset.url;
          const local = await readMedia(asset), remote = await readPublicImage(mediaUrl);
          if (asset.sha256 !== digest(local)) throw new Error('Reviewed artwork changed on disk; reimport and approve the current image.');
          if (digest(local) !== digest(remote)) throw new Error('Remote artwork must match the reviewed original exactly. Host the final file before handoff.');
          const job = { id: `${p.id}-v${p.version}`, draftId: p.id, version: p.version, approval: p.approval, channel: 'remote', accountId: p.accountId,
            title: p.title, description: p.description, altText: p.altText, aiDisclosure: p.aiDisclosure, destination: p.destination, boardId: p.boardId, sectionId: p.sectionId,
            scheduledAt: params.times?.[p.id] || p.scheduledAt, mediaUrl, mediaSha256: digest(remote) };
          validateJob(job); jobs.push(job);
        }
        const batchId = randomUUID();
        return saveFile(`approved-worker-pins-${batchId}.json`, Buffer.from(JSON.stringify(sign({ type: 'approved-pins', batchId, jobs, createdAt: new Date().toISOString() }, secret))), [{ name: 'Signed Worker Batch', extensions: ['json'] }], {
          beforeWrite: () => {
            const current = store.get('pinWorkspace', {});
            for (const p of chosen) { const c = current.drafts.find(c => c.id === p.id); if (c?.state !== 'approved' || c.version !== p.version || fingerprint(c) !== fingerprint(p) || (current.jobs || []).some(j => j.draftId === p.id && ['queued', 'scheduled', 'publishing', 'retry_wait', 'reconciling'].includes(j.status))) throw new Error('Draft changed during handoff. Review and try again.'); }
            current.drafts = current.drafts.map(p => jobs.some(j => j.draftId === p.id) ? { ...p, state: 'remote_pending', remoteHandoff: { batchId, jobId: jobs.find(j => j.draftId === p.id).id, at: new Date().toISOString() } } : p);
            store.set('pinWorkspace', current);
          }
        });
      }
      case 'worker-receipt': {
        const { verify } = require('../worker/protocol.cjs'), input = await readReceipt(); if (!input) return { canceled: true };
        const receipt = verify(input, decrypt(store.get('qualityWorkerSigningSecret', '')));
        if (receipt.type !== 'receipt' || !Array.isArray(receipt.rows) || receipt.rows.length > 10000) throw new Error('Invalid worker receipt.');
        const d = store.get('pinWorkspace', {});
        d.drafts = (d.drafts || []).map(p => {
          if (!p.remoteHandoff) return p;
          const r = receipt.rows.find(r => r.id === p.remoteHandoff.jobId);
          if (!r || !['published', 'rejected', 'uncertain', 'attempting', 'queued', 'needs-credentials', 'missed', 'account-mismatch'].includes(r.state) || !Number.isFinite(Date.parse(r.updated_at))) return p;
          if (p.remoteHandoff.receiptAt && Date.parse(r.updated_at) <= Date.parse(p.remoteHandoff.receiptAt)) return p;
          const needsNewApproval = ['rejected', 'missed', 'account-mismatch'].includes(r.state);
          return { ...p, state: r.state === 'published' && r.result?.remoteId ? 'published' : needsNewApproval ? 'awaiting_review' : 'remote_pending', remoteId: r.result?.remoteId || p.remoteId,
            ...(needsNewApproval ? { approval: null, version: p.version + 1 } : {}),
            remoteHandoff: { ...p.remoteHandoff, status: r.state, receiptAt: r.updated_at } };
        }); store.set('pinWorkspace', d); return {};
      }
      default: throw new Error('Unknown quality action.');
    }
  }
  return { run };
}
module.exports = { createQualityWorkspace };
