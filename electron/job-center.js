const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function cleanText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safePayload(value, depth = 0) {
  if (depth > 3 || value == null) return value == null ? null : undefined;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safePayload(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? cleanText(value, 1000) : value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|api.?key|authorization|credential/i.test(key)) continue;
    result[String(key).slice(0, 80)] = safePayload(item, depth + 1);
  }
  return result;
}

function jobKind(jobKey = '') {
  const key = String(jobKey).toLowerCase();
  if (key.includes('cluster')) return { type: 'pinterest', workspace: 'cluster-planner', label: 'Pinterest cluster planning' };
  if (key.includes('rmm') || key.includes('recipe-money')) return { type: 'recipe', workspace: 'recipe-money-maker', label: 'Recipe Money Maker' };
  if (key.includes('keyword') || key.includes('trend')) return { type: 'research', workspace: 'trends', label: 'Keyword and trend research' };
  if (key.includes('quality')) return { type: 'qa', workspace: 'quality-studio', label: 'Quality Studio' };
  if (key.includes('article')) return { type: 'article', workspace: 'articles', label: 'Article generation' };
  if (key.includes('pin')) return { type: 'pinterest', workspace: 'pin-creator', label: 'Pinterest generation' };
  if (key.includes('meta') || key.includes('ghl')) return { type: 'meta', workspace: 'meta-studio', label: 'Meta delivery' };
  if (key.includes('video')) return { type: 'video', workspace: 'video-studio', label: 'Video generation' };
  if (key.includes('publish') || key.includes('wordpress')) return { type: 'wordpress', workspace: 'articles', label: 'WordPress publishing' };
  if (key.includes('qa') || key.includes('audit')) return { type: 'qa', workspace: 'performance', label: 'Post-publish QA' };
  return { type: 'system', workspace: 'diagnostics', label: 'Background task' };
}

function createJobCenter({ store, onChange = () => {}, limit = 500 }) {
  function read() {
    const jobs = store.get('jobCenterJobs', []);
    return Array.isArray(jobs) ? jobs : [];
  }

  function write(jobs) {
    const sorted = [...jobs]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, limit);
    store.set('jobCenterJobs', sorted);
    onChange(sorted);
    return sorted;
  }

  function upsert(id, patch = {}) {
    const now = new Date().toISOString();
    const jobs = read();
    const previous = jobs.find((job) => job.id === id) || {};
    const next = {
      id: cleanText(id, 180),
      createdAt: previous.createdAt || now,
      progress: 0,
      status: 'queued',
      ...previous,
      ...safePayload(patch),
      updatedAt: now
    };
    write([next, ...jobs.filter((job) => job.id !== id)]);
    return next;
  }

  function start(id, metadata = {}) {
    const inferred = jobKind(id);
    return upsert(id, {
      ...inferred,
      ...metadata,
      status: 'running',
      progress: Math.max(0, Number(metadata.progress || 0)),
      error: '',
      startedAt: new Date().toISOString(),
      finishedAt: ''
    });
  }

  function update(id, patch = {}) {
    if (!read().some((job) => job.id === id)) start(id, patch);
    return upsert(id, patch);
  }

  function finish(id, status = 'completed', patch = {}) {
    return upsert(id, {
      ...patch,
      status,
      progress: status === 'completed' ? 100 : Number(patch.progress || 0),
      finishedAt: new Date().toISOString()
    });
  }

  function recoverInterrupted() {
    const now = new Date().toISOString();
    let changed = false;
    const jobs = read().map((job) => {
      if (!['running', 'cancelling'].includes(job.status)) return job;
      changed = true;
      return {
        ...job,
        status: 'interrupted',
        error: 'The app closed before this task finished. Open its workspace to retry.',
        updatedAt: now,
        finishedAt: now
      };
    });
    if (changed) write(jobs);
    return jobs;
  }

  function clearFinished() {
    return write(read().filter((job) => !TERMINAL_STATUSES.has(job.status)));
  }

  return { clearFinished, finish, list: read, recoverInterrupted, start, update };
}

module.exports = { TERMINAL_STATUSES, createJobCenter, jobKind, safePayload };
