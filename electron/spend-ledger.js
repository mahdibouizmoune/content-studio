'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { COST_ESTIMATES } = require('./cost-estimation');
const ROOT = 'generationSpending';
function createSpendLedger({ store, now = Date.now }) {
  const get = () => { const d = store.get(ROOT, {}); return { ...d, entries: d.entries || [], policy: { enabled: false, dailyUsd: 5, quotes: {}, ...d.policy } }; };
  const save = d => { store.set(ROOT, d); return d; };
  const day = t => new Date(t).toISOString().slice(0, 10);
  function summary() {
    const d = get(), entries = d.entries.filter(e => day(e.createdAt) === day(now()));
    return { ...d, today: { estimatedCommitted: entries.filter(e => e.status !== 'rejected').reduce((sum, e) => sum + (e.reportedUsd ?? e.estimateUsd ?? 0), 0),
      reportedActual: entries.reduce((sum, e) => sum + (e.reportedUsd ?? 0), 0), unknownCount: entries.filter(e => e.status !== 'rejected' && e.reportedUsd === null).length } };
  }
  function configure(policy) {
    const d = get(), dailyUsd = Number(policy.dailyUsd);
    if (!Number.isFinite(dailyUsd) || dailyUsd <= 0 || dailyUsd > 10000) throw new Error('Daily budget must be greater than zero and at most 10000 USD.');
    const quotes = {};
    if (policy.quotes && (typeof policy.quotes !== 'object' || Array.isArray(policy.quotes) || Object.keys(policy.quotes).length > 500)) throw new Error('Use at most 500 model reservations.');
    for (const [model, amount] of Object.entries(policy.quotes || {})) {
      if (!/^[\w./:-]{1,160}$/.test(model) || !Number.isFinite(Number(amount)) || amount <= 0 || amount > 1000) throw new Error('Each model needs a positive USD reservation quote.');
      quotes[model] = Number(amount);
    }
    d.policy = { enabled: policy.enabled === true, dailyUsd, quotes }; save(d); return summary();
  }
  function reserve({ model, input, estimateUsd, provider = 'replicate', context = {} }) {
    const d = get();
    estimateUsd = Number(d.policy.quotes[model] ?? estimateUsd);
    if (d.policy.enabled && d.entries.some(e => day(e.createdAt) === day(now()) && e.status !== 'rejected' && e.estimateUsd === null && e.reportedUsd === null)) {
      const error = new Error('Reconcile today\'s unknown charges before enabling more paid requests.'); error.noRetry = true; throw error;
    }
    if (!Number.isFinite(estimateUsd) || estimateUsd <= 0) {
      if (d.policy.enabled) { const error = new Error(`Set a per-request reservation for ${model} before using the daily spending guard.`); error.noRetry = true; throw error; }
      estimateUsd = null;
    }
    const evaluation = store.get('contentOperations.evaluationRuns', []).find(run => run.pinIds?.includes(context.pinId));
    if (evaluation) {
      const entries = d.entries.filter(e => evaluation.pinIds.includes(e.pinId) && e.status !== 'rejected');
      const committed = entries.reduce((sum, e) => sum + (e.reportedUsd ?? e.estimateUsd ?? 0), 0);
      if (!estimateUsd || entries.some(e => e.estimateUsd === null && e.reportedUsd === null) || committed + estimateUsd > evaluation.budgetUsd + 1e-9) {
        const error = new Error('Evaluation estimated budget reached or price unknown. Reconcile charges and create a new explicitly budgeted run before more test generations.'); error.noRetry = true; throw error;
      }
    }
    if (d.policy.enabled && summary().today.estimatedCommitted + estimateUsd > d.policy.dailyUsd + 1e-9) {
      const error = new Error('Daily generation budget reached. Review Spending before submitting another paid request.'); error.noRetry = true; throw error;
    }
    const scope = Object.fromEntries(['articleId', 'pinId', 'jobKey'].filter(k => typeof context[k] === 'string' && context[k].length <= 180).map(k => [k, context[k]]));
    const entry = { id: randomUUID(), provider, model, ...scope, inputHash: createHash('sha256').update(JSON.stringify(input || {})).digest('hex'), estimateUsd, reportedUsd: null, status: 'reserved', createdAt: new Date(now()).toISOString() };
    d.entries.unshift(entry); save(d); return entry.id;
  }
  function update(id, patch) { const d = get(), e = d.entries.find(e => e.id === id); if (e) { Object.assign(e, patch); save(d); } }
  function reconcile({ id, amount, evidence }) {
    if (amount === '' || amount === null || !Number.isFinite(Number(amount)) || amount < 0 || amount > 10000 || !String(evidence || '').trim()) throw new Error('Provide a nonnegative USD amount and receipt reference.');
    if (!get().entries.some(e => e.id === id)) throw new Error('Unknown spending entry.');
    update(id, { reportedUsd: Number(amount), evidence: String(evidence).slice(0, 250), reconciledAt: new Date(now()).toISOString(), status: 'reconciled' }); return summary();
  }
  return { get, summary, configure, reserve, update, reconcile };
}
function estimateModel(model) {
  if (/ideogram.*turbo/.test(model)) return 0.03;
  for (const [id, value] of Object.entries(COST_ESTIMATES.image)) if (model.endsWith(`/${id}`)) return value;
  const alias = { 'gpt-5-nano': 'gpt5nano', 'gpt-5-mini': 'gpt5mini', 'gpt-4.1-mini': 'gpt41mini', 'gemini-2.5-flash': 'gemini', 'deepseek-v3': 'deepseek', 'gpt-5': 'chatgpt' };
  return COST_ESTIMATES.text[alias[model.split('/').at(-1)]] ?? null;
}
function installSpendInterceptors(axios, ledger) {
  const requestId = axios.interceptors.request.use(config => {
    let u; try { u = new URL(config.url, config.baseURL); } catch { return config; }
    if (u.origin !== 'https://api.replicate.com' || String(config.method).toLowerCase() !== 'post' || !/\/predictions$/.test(u.pathname)) return config;
    if (config.spendEntryId) { const error = new Error('Paid request replay blocked; reconcile the existing prediction first.'); error.noRetry = true; throw error; }
    const model = u.pathname.match(/\/models\/(.+)\/predictions$/)?.[1] || `version:${String(config.data?.version || 'unknown').slice(0, 80)}`;
    config.spendEntryId = ledger.reserve({ model, input: config.data?.input, estimateUsd: estimateModel(model), context: config.generationContext || {} });
    return config;
  });
  const responseId = axios.interceptors.response.use(response => {
    const id = response.config?.spendEntryId;
    if (id) ledger.update(id, { predictionId: response.data?.id || '', status: response.data?.id ? 'submitted' : 'uncertain' });
    return response;
  }, error => {
    const id = error.config?.spendEntryId, status = error.response?.status;
    if (id) ledger.update(id, { status: [400, 401, 402, 403, 404, 413, 415, 422, 429].includes(status) ? 'rejected' : 'uncertain', errorCode: status || 'network' });
    return Promise.reject(error);
  });
  return () => { axios.interceptors.request.eject(requestId); axios.interceptors.response.eject(responseId); };
}
module.exports = { createSpendLedger, installSpendInterceptors, estimateModel };
