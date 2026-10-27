import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { electronAPI } from '@/lib/electron';
import { Button, Field, inputClass } from '@/components/ui';
const utc = value => new Date(value).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' });
export default function PublishedArchive({ onImported }) {
  const [data, setData] = useState(null), [siteId, setSiteId] = useState(''), [page, setPage] = useState('1'), [after, setAfter] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const call = useCallback(async (action, params = {}) => { const r = await electronAPI.qualityWorkspace(`content:archive:${action}`, params); if (!r.success) throw new Error(r.error); return r.result; }, []);
  const load = useCallback(async () => setData(await call('snapshot')), [call]);
  useEffect(() => { load().catch(e => setMessage(e.message)); }, [load]);
  async function run(action, params) {
    setBusy(true); setMessage('');
    try { const r = await call(action, params); await load(); if (action === 'import') { await onImported?.(); setMessage(r.duplicate ? 'Already in Content Pipeline. Existing article was not changed.' : 'Published reference added to Content Pipeline. Website unchanged.'); } else setMessage(r.count == null ? 'Reference removed.' : `${r.count} references refreshed.`); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <div className="space-y-4" aria-busy={busy}>
    <div className="grid gap-3 md:grid-cols-3"><Field label="Archive website"><select aria-label="Archive website" className={inputClass} value={siteId} disabled={busy} onChange={e => { setSiteId(e.target.value); setPage('1'); }}><option value="">Choose WordPress site</option>{data?.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Archive page"><input aria-label="Archive page" type="number" min="1" max="10000" className={inputClass} value={page} onChange={e => setPage(e.target.value)} /></Field><Field label="Modified after (UTC, optional)"><input aria-label="Modified after UTC" type="datetime-local" className={inputClass} value={after} onChange={e => { setAfter(e.target.value); setPage('1'); }} /></Field></div>
    <Button disabled={busy || !siteId} onClick={() => run('sync', { siteId, page: Number(page), modifiedAfter: after ? `${after}:00Z` : '' })}><RefreshCw size={16} />Read Published Posts</Button>
    {message && <p className="border-l-4 border-teal-600 py-2 pl-3 text-sm" role="status">{message}</p>}
    {data?.lastRead && <p className="text-xs text-slate-500">Page {data.lastRead.page} of {data.lastRead.totalPages} · {utc(data.lastRead.readAt)} · Read-only archive</p>}
    {data?.posts.filter(p => !siteId || p.siteId === siteId).map(p => <article key={p.key} className="border-b border-slate-200 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{p.title}</h3><p className="mt-1 text-xs text-slate-500">Revised {utc(p.modifiedAt)} · {p.recipes.length} source recipes · {p.images.length} images</p><a className="mt-1 block break-all text-xs text-teal-700" href={p.url} target="_blank" rel="noreferrer">{p.url}</a></div><Button variant="ghost" title="Remove cached reference" aria-label={`Remove archive reference ${p.title}`} disabled={busy} onClick={() => run('remove', { key: p.key })}><Trash2 size={16} /></Button></div><Button className="mt-3" variant="secondary" disabled={busy} onClick={() => run('import', { key: p.key })}><Download size={16} />Add Published Reference</Button></article>)}
    {data && !data.posts.length && <p className="text-sm text-slate-500">No published references cached.</p>}
  </div>;
}
