const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const identity = (site, index) => site?.id ? `id:${site.id}` : site?.url ? `url:${String(site.url).replace(/\/+$/, '')}` : `index:${index}`;
const syncGroups = [['internalLinkPosts', 'internalLinksSyncedAt'], ['categories', 'categoriesSyncedAt']];
const safeFields = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Invalid settings patch.');
  return value;
};

function mergeSite(previous, changes) {
  safeFields(changes);
  const result = { ...previous, ...changes };
  const oldUrl = String(previous.url || '').replace(/\/+$/, '');
  if (Object.hasOwn(changes, 'url') && String(changes.url || '').replace(/\/+$/, '') !== oldUrl) {
    for (const fields of syncGroups) for (const field of fields) delete result[field];
    return result;
  }
  for (const [data, timestamp] of syncGroups) {
    const currentDate = Date.parse(previous[timestamp] || '');
    const incomingDate = Date.parse(changes[timestamp] || '');
    if (Number.isFinite(currentDate) && (!Number.isFinite(incomingDate) || incomingDate < currentDate)) {
      if (Object.hasOwn(previous, data)) result[data] = previous[data];
      result[timestamp] = previous[timestamp];
    }
  }
  return result;
}

export function settingsPatch(base, next) {
  const previous = base && typeof base === 'object' ? base : {};
  const patch = {};
  for (const [key, value] of Object.entries(next || {})) {
    if (equal(value, previous[key])) continue;
    if (key !== 'wordpressSites' || !Array.isArray(value)) { patch[key] = value; continue; }
    const oldSites = Array.isArray(previous.wordpressSites) ? previous.wordpressSites : [];
    const old = new Map(oldSites.map((site, index) => [identity(site, index), site]));
    const ids = value.map(identity);
    patch.wordpressSiteEdits = {
      remove: [...old.keys()].filter(id => !ids.includes(id)),
      order: ids,
      update: value.flatMap((site, index) => {
        const id = ids[index], saved = old.get(id);
        const changes = Object.fromEntries(Object.entries(site).filter(([field, v]) => !saved || !equal(v, saved[field])));
        return Object.keys(changes).length ? [{ id, create: !saved, changes }] : [];
      })
    };
  }
  return patch;
}

export function mergeSettingsPatch(previous = {}, incoming = {}) {
  safeFields(incoming);
  const { wordpressSiteEdits, ...fields } = incoming;
  const merged = { ...previous, ...fields };
  const current = Array.isArray(previous.wordpressSites) ? previous.wordpressSites : [];
  if (wordpressSiteEdits !== undefined) {
    safeFields(wordpressSiteEdits);
    const { remove, update, order } = wordpressSiteEdits;
    if (![remove, update, order].every(value => Array.isArray(value) && value.length <= 500)) throw new Error('Invalid WordPress site edits.');
    const sites = new Map(current.map((site, index) => [identity(site, index), site]));
    for (const id of remove) sites.delete(id);
    for (const edit of update) {
      safeFields(edit); safeFields(edit.changes);
      const saved = sites.get(edit.id);
      if (!saved && !edit.create) throw new Error('A WordPress site was removed or changed elsewhere. Reload settings before saving.');
      if (saved && edit.create) throw new Error('A WordPress site was added elsewhere. Reload settings before saving.');
      const site = saved ? mergeSite(saved, edit.changes) : { ...edit.changes };
      if (identity(site, order.indexOf(edit.id)) !== edit.id) throw new Error('WordPress site identity changed. Reload settings.');
      sites.set(edit.id, site);
    }
    const sorted = [...new Set([...order, ...sites.keys()])];
    merged.wordpressSites = sorted.filter(id => sites.has(id)).map(id => sites.get(id));
  } else if (Array.isArray(fields.wordpressSites)) {
    // Older callers still submit full arrays; do not roll back newer background syncs.
    merged.wordpressSites = fields.wordpressSites.map((site, index) => {
      const saved = current.find((old, oldIndex) => identity(old, oldIndex) === identity(site, index));
      return saved ? mergeSite(saved, site) : site;
    });
  }
  return merged;
}
