import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Eye, FileSearch, ImagePlus, LoaderCircle, Plus, RefreshCw, ScanText, ShoppingCart, Trash2, Type } from 'lucide-react';
import { electronAPI } from '@/lib/electron';
import SectionHeader from '@/components/SectionHeader';
import VirtualList from '@/components/VirtualList';
import { Button, Field, inputClass } from '@/components/ui';

const tabs = ['Recipes', 'Images', 'Spending', 'Reader Events', 'Release & Worker'];
const usd = n => n == null ? 'Unknown' : `$${Number(n).toFixed(4)}`;
export default function QualityStudio() {
  const [data, setData] = useState(null), [tab, setTab] = useState(tabs[0]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [ids, setIds] = useState([]);
  const [name, setName] = useState(''), [multiplier, setMultiplier] = useState('1'), [sourceUrl, setSourceUrl] = useState(''), [sourceRecipes, setSourceRecipes] = useState([]);
  const [pinId, setPinId] = useState(''), [expected, setExpected] = useState(''), [placement, setPlacement] = useState('middle'), [cleanPhoto, setCleanPhoto] = useState(false);
  const [budgetEnabled, setBudgetEnabled] = useState(false), [dailyUsd, setDailyUsd] = useState('5'), [quotes, setQuotes] = useState({}), [newModel, setNewModel] = useState(''), [newQuote, setNewQuote] = useState('');
  const [receiptId, setReceiptId] = useState(''), [receiptUsd, setReceiptUsd] = useState(''), [evidence, setEvidence] = useState('');
  const [workerSecret, setWorkerSecret] = useState(''), [workerIds, setWorkerIds] = useState([]), [workerMedia, setWorkerMedia] = useState({}), [workerTimes, setWorkerTimes] = useState({});
  const load = useCallback(async () => {
    const response = await electronAPI.qualityWorkspace('snapshot');
    if (!response.success) throw new Error(response.error);
    setData(response.result); return response.result;
  }, []);
  useEffect(() => { let active = true; load().then(d => { if (!active) return; setBudgetEnabled(d.spending.policy.enabled); setDailyUsd(String(d.spending.policy.dailyUsd)); setQuotes(d.spending.policy.quotes); }).catch(e => { if (active) setMessage(e.message); }); return () => { active = false; }; }, [load]);
  async function run(action, params = {}) {
    setBusy(true); setMessage('');
    try {
      const response = await electronAPI.qualityWorkspace(action, params);
      if (!response.success) throw new Error(response.error);
      await load();
      setMessage(response.result?.canceled ? 'Download cancelled.' : response.result?.path ? `Saved: ${response.result.path}` : 'Done.');
      return response.result;
    } catch (error) { setMessage(error.message); return null; }
    finally { setBusy(false); }
  }
  const pin = data?.pins.find(p => p.id === pinId);
  const textCheck = pin?.imageQa?.textCheck, review = pin?.imageQa?.visualReview;
  const textCurrent = Boolean(textCheck && textCheck.imageSha256 === pin?.imageQa?.sha256);
  const visualCurrent = Boolean(review && review.imageSha256 === pin?.imageQa?.sha256);
  function choosePin(id) { const p = data.pins.find(p => p.id === id); setPinId(id); setExpected(p?.imageQa?.textCheck?.expected || ''); setCleanPhoto(false); }
  const toggle = id => setIds(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  return <section className="mx-auto max-w-6xl space-y-5" aria-busy={busy}>
    <SectionHeader eyebrow="System" title="Quality Studio" action={<Button variant="secondary" disabled={busy} onClick={() => load().catch(e => setMessage(e.message))}><RefreshCw className="h-4 w-4" />Refresh</Button>} />
    <div role="tablist" aria-label="Quality views" className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">{tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded px-3 py-2 text-sm font-bold ${tab === t ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t}</button>)}</div>
    {busy && <div role="status" className="flex items-center gap-2 text-sm font-semibold"><LoaderCircle className="h-4 w-4 animate-spin" />Working...</div>}
    {message && <p role="status" className="break-words rounded border border-slate-200 px-4 py-3 text-sm">{message}</p>}
    {!data ? <p className="text-sm text-slate-500">No desktop workspace loaded.</p> : <>
      {tab === 'Recipes' && <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy || !ids.length} onClick={() => run('inspect-recipes', { ids })}><FileSearch className="h-4 w-4" />Check Selected ({ids.length})</Button>
          <Button variant="secondary" onClick={() => setIds(ids.length === data.articles.length ? [] : data.articles.map(a => a.id))}><Check className="h-4 w-4" />{ids.length === data.articles.length ? 'Clear Selection' : 'Select All'}</Button>
        </div>
        <VirtualList items={data.articles} label="Saved recipe articles" estimateSize={130}>{article => {
          const report = data.reports[article.id];
          return <article className="border-b border-slate-200 pb-3"><label className="flex gap-3 font-semibold"><input type="checkbox" className="mt-1" checked={ids.includes(article.id)} onChange={() => toggle(article.id)} />{article.title}</label>
            {report && <div className="ml-6 mt-2 text-sm"><p className={report.status === 'needs-repair' ? 'text-rose-700' : 'text-emerald-700'}>{report.status} · {(report.recipes || [report.recipe]).reduce((n, r) => n + r.ingredients.length, 0)} ingredients · {(report.recipes || [report.recipe]).reduce((n, r) => n + r.instructions.length, 0)} steps{report.recipeCount > 1 ? ` · ${report.recipeCount} recipes checked` : ''}</p><ul className="mt-1 list-disc pl-4 text-slate-600">{report.issues.map((i, index) => <li key={index}>{i.message}</li>)}</ul></div>}
          </article>;
        }}</VirtualList>
        <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
          <div className="space-y-3"><h2 className="text-lg font-bold">Collections &amp; Shopping Lists</h2>
            <Field label="Collection name"><input className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>
            <Button variant="secondary" disabled={busy || !name.trim() || !ids.length} onClick={() => run('collection-save', { name, ids })}><Check className="h-4 w-4" />Save Collection</Button>
            {data.collections.map(c => <div key={c.id} className="flex items-center justify-between gap-2 border-b border-slate-200 py-2"><button className="break-words text-left font-semibold" onClick={() => setIds(c.ids.filter(id => data.articles.some(a => a.id === id)))}>{c.name} ({c.ids.length})</button><Button variant="ghost" aria-label={`Delete ${c.name}`} title="Delete collection" disabled={busy} onClick={() => run('collection-delete', { id: c.id })}><Trash2 className="h-4 w-4" /></Button></div>)}
            <Field label="Serving multiplier"><input type="number" min="0.25" max="20" step="0.25" className={inputClass} value={multiplier} onChange={e => setMultiplier(e.target.value)} /></Field>
            <Button disabled={busy || !ids.length} onClick={() => run('shopping-list', { ids, multiplier: Number(multiplier) })}><ShoppingCart className="h-4 w-4" />Download Shopping List</Button>
          </div>
          <div className="space-y-3"><h2 className="text-lg font-bold">Source Recipe Evidence</h2>
            <Field label="Recipe source URL"><input type="url" className={inputClass} value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} /></Field>
            <Button variant="secondary" disabled={busy || !sourceUrl} onClick={async () => { const result = await run('source-recipe', { url: sourceUrl }); if (result) { setSourceRecipes(result.recipes); if (!result.recipes.length) setMessage('No Recipe JSON-LD found. No ingredients were invented.'); } }}><FileSearch className="h-4 w-4" />Read Source Recipe</Button>
            {sourceRecipes.map((r, i) => <div key={i} className="border-t border-slate-200 pt-3"><h3 className="font-bold">{r.name}</h3><ul className="list-disc pl-5 text-sm">{r.ingredients.map((line, j) => <li key={j}>{line}</li>)}</ul><ol className="mt-2 list-decimal pl-5 text-sm">{r.instructions.map((line, j) => <li key={j}>{line}</li>)}</ol><p className="mt-2 break-all text-xs text-slate-500">{r.sourceUrl} · {r.evidence}</p></div>)}
          </div>
        </div>
      </div>}
      {tab === 'Images' && <div className="space-y-4">
        <Button variant="secondary" disabled={busy} onClick={async () => {
          try {
            const selected = await electronAPI.selectArticleImage();
            if (!selected?.success) { if (selected?.error) setMessage(selected.error); return; }
            const result = await run('import-photo', { localPath: selected.localPath });
            if (result?.pin) { setPinId(result.pin.id); setExpected(''); setCleanPhoto(false); }
          } catch (e) { setMessage(e.message); }
        }}><ImagePlus className="h-4 w-4" />Import Clean Photograph</Button>
        <Field label="Saved Pin"><select aria-label="Saved Pin" className={inputClass} value={pinId} onChange={e => choosePin(e.target.value)}><option value="">Choose final artwork</option>{data.pins.map(p => <option key={p.id} value={p.id}>{p.title || p.id}</option>)}</select></Field>
        {pin && <div className="grid items-start gap-6 md:grid-cols-[minmax(180px,300px)_1fr]">
          <img src={pin.displayUrl} alt={pin.title || 'Final Pin'} className="h-auto max-h-[75vh] w-full object-contain" />
          <div className="min-w-0 space-y-4">
            <p className="text-sm font-semibold">Text: {textCurrent ? textCheck.status : 'Unchecked'} · Visual review: {visualCurrent ? review.status : 'Unchecked'}</p>
            <Field label="Exact visible text"><textarea rows={3} maxLength={160} className={inputClass} value={expected} onChange={e => setExpected(e.target.value)} /></Field>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !pin.localPath || !expected.trim()} onClick={() => run('check-text', { id: pin.id, expected })}><ScanText className="h-4 w-4" />Check Text Locally</Button>
              <Button variant="secondary" disabled={busy || !pin.localPath} onClick={() => run('visual-review', { id: pin.id, approved: true, sha256: pin.imageQa?.sha256 })}><Eye className="h-4 w-4" />Mark Visually Reviewed</Button>
              <Button variant="danger" disabled={busy} onClick={() => run('visual-review', { id: pin.id, approved: false })}>Needs Review</Button></div>
            {textCheck && <div className="border-l-2 border-amber-400 pl-3 text-sm"><p>Recognized: {textCheck.observed || '(No text detected)'}</p><p>Confidence: {Math.round(textCheck.confidence || 0)}%</p><p>Missing: {textCheck.missing.join(', ') || 'None'} · Extra: {textCheck.extra.join(', ') || 'None'}</p></div>}
            <div className="space-y-3 border-t border-slate-200 pt-4"><h2 className="text-lg font-bold">Optional Exact-Text Copy</h2>
              <Field label="Headline position"><select aria-label="Headline position" className={inputClass} value={placement} onChange={e => setPlacement(e.target.value)}><option value="middle">Middle</option><option value="top">Top</option><option value="bottom">Bottom</option></select></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cleanPhoto} onChange={e => setCleanPhoto(e.target.checked)} />This photograph has no existing lettering</label>
              <Button variant="secondary" disabled={busy || !cleanPhoto || !pin.localPath || !expected.trim() || expected.length > 100} onClick={async () => { const result = await run('exact-template', { id: pin.id, text: expected, placement, cleanPhotoConfirmed: cleanPhoto }); if (result?.pin) { setPinId(result.pin.id); setCleanPhoto(false); } }}><Type className="h-4 w-4" />Create Exact-Text Copy</Button>
            </div>
          </div>
        </div>}
      </div>}
      {tab === 'Spending' && <div className="space-y-5">
        <dl className="grid gap-4 border-b border-slate-200 pb-4 sm:grid-cols-3">{[['UTC Today: Reserved / Reported', usd(data.spending.today.estimatedCommitted)], ['Receipt-reported', usd(data.spending.today.reportedActual)], ['Unreconciled Requests', data.spending.today.unknownCount]].map(([k, v]) => <div key={k}><dt className="text-sm text-slate-500">{k}</dt><dd className="text-xl font-bold">{v}</dd></div>)}</dl>
        <div className="grid gap-5 md:grid-cols-2"><div className="space-y-3">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={budgetEnabled} onChange={e => setBudgetEnabled(e.target.checked)} />Enable daily reservation limit</label>
          <Field label="Daily USD limit (UTC)"><input className={inputClass} type="number" min="0.01" step="0.01" value={dailyUsd} onChange={e => setDailyUsd(e.target.value)} /></Field>
          <div className="space-y-2"><h2 className="text-base font-bold">Per-Request Reservations</h2>
            {Object.entries(quotes).map(([model, amount]) => <div className="flex items-center gap-2" key={model}><span className="min-w-0 flex-1 break-all text-sm">{model}</span><input aria-label={`USD reservation for ${model}`} type="number" min="0.0001" step="0.0001" className={`${inputClass} max-w-28`} value={amount} onChange={e => setQuotes(old => ({ ...old, [model]: Number(e.target.value) }))} /><Button variant="ghost" title="Remove reservation" aria-label={`Remove ${model} reservation`} onClick={() => setQuotes(old => Object.fromEntries(Object.entries(old).filter(([key]) => key !== model)))}><Trash2 className="h-4 w-4" /></Button></div>)}
            <Field label="Model name"><input className={inputClass} list="spending-models" value={newModel} onChange={e => setNewModel(e.target.value)} /><datalist id="spending-models">{[...new Set(['deepseek/deepseek-chat', ...data.spending.entries.map(e => e.model)])].map(model => <option value={model} key={model} />)}</datalist></Field>
            <Field label="USD reservation per request"><input className={inputClass} type="number" min="0.0001" step="0.0001" value={newQuote} onChange={e => setNewQuote(e.target.value)} /></Field>
            <Button variant="secondary" disabled={!newModel.trim() || !Number.isFinite(Number(newQuote)) || Number(newQuote) <= 0} onClick={() => { setQuotes(old => ({ ...old, [newModel.trim()]: Number(newQuote) })); setNewModel(''); setNewQuote(''); }}><Plus className="h-4 w-4" />Add Reservation</Button>
          </div>
          <Button disabled={busy} onClick={() => run('spending-configure', { enabled: budgetEnabled, dailyUsd: Number(dailyUsd), quotes })}><Check className="h-4 w-4" />Save Spending Guard</Button>
        </div><div className="space-y-3"><h2 className="text-lg font-bold">Reconcile Provider Receipt</h2>
          <Field label="Request"><select aria-label="Request" className={inputClass} value={receiptId} onChange={e => setReceiptId(e.target.value)}><option value="">Choose request</option>{data.spending.entries.map(e => <option key={e.id} value={e.id}>{e.createdAt} · {e.model}</option>)}</select></Field>
          <Field label="Actual charged USD"><input className={inputClass} type="number" min="0" step="0.0001" value={receiptUsd} onChange={e => setReceiptUsd(e.target.value)} /></Field>
          <Field label="Receipt reference"><input className={inputClass} value={evidence} onChange={e => setEvidence(e.target.value)} /></Field>
          <Button variant="secondary" disabled={busy || !receiptId || receiptUsd === '' || !evidence.trim()} onClick={() => run('spending-reconcile', { id: receiptId, amount: Number(receiptUsd), evidence })}><Check className="h-4 w-4" />Save Reconciliation</Button>
        </div></div>
        <VirtualList items={data.spending.entries} label="Generation spending log" estimateSize={94}>{e => <div className="grid gap-1 border-b border-slate-200 py-2 text-sm sm:grid-cols-[1fr_auto]"><div><p className="break-all font-semibold">{e.model}</p><p className="text-xs text-slate-500">{e.createdAt} · {e.status} · {e.predictionId || e.id}</p></div><p>Reserved {usd(e.estimateUsd)} · Receipt {usd(e.reportedUsd)}</p></div>}</VirtualList>
      </div>}
      {tab === 'Reader Events' && <div className="space-y-4">
        {data.analyticsError && <p className="text-sm text-amber-700">{data.analyticsError}</p>}
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => run('reader-plugin')}><Download className="h-4 w-4" />Download Reader Plugin</Button><Button disabled={busy} onClick={() => run('events-refresh')}><RefreshCw className="h-4 w-4" />Refresh GA4 Recipe Events</Button></div>
        {data.events ? <><p className="text-sm text-slate-500">{data.events.window} · {data.events.fetchedAt} · {data.events.unit}{data.events.limited ? ' · Limited by Google sampling or privacy thresholds' : ''}</p>
          <VirtualList items={data.events.rows.map((r, id) => ({ ...r, id }))} estimateSize={90} label="Recipe engagement events">{r => <div className="grid gap-2 border-b border-slate-200 py-3 text-sm sm:grid-cols-[1fr_1fr_auto]"><span className="break-all">{r.path}</span><span className="break-all">{r.creative || 'Unattributed'} · {r.event}</span><strong>{r.count}</strong></div>}</VirtualList>
          {!data.events.rows.length && <p>No measured recipe events in this date range.</p>}
        </> : <p className="text-sm text-slate-500">No measured recipe events synced.</p>}
      </div>}
      {tab === 'Release & Worker' && <div className="space-y-5">
        <h2 className="text-lg font-bold">Installed Build</h2><dl className="grid gap-2 text-sm sm:grid-cols-2"><dt>Version</dt><dd>{data.release.installedVersion}</dd><dt>Source commit</dt><dd className="break-all">{data.release.commit || 'Development checkout'}</dd><dt>Release tag</dt><dd>{data.release.tag || 'Not a tagged release'}</dd><dt>Source checks</dt><dd>{data.release.verified ? 'Clean tagged source' : 'Unverified development build'}</dd><dt>Build time</dt><dd>{data.release.builtAt || 'Not recorded'}</dd></dl>
        <div className="space-y-4 border-t border-slate-200 pt-4"><h2 className="text-lg font-bold">Optional Server Publisher</h2><p className="text-sm text-slate-600">{data.workerPaired ? 'Signing key saved. Server deployment is separate.' : 'Not paired.'} · Requires PostgreSQL and approved Pinterest API access. CSV remains independent.</p>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => run('worker-package')}><Download className="h-4 w-4" />Download Worker Files</Button><Button variant="secondary" disabled={busy || !data.workerPaired} onClick={() => run('worker-receipt')}><FileSearch className="h-4 w-4" />Import Signed Results</Button></div>
          <Field label="Separate worker signing secret"><input type="password" autoComplete="new-password" className={inputClass} value={workerSecret} onChange={e => setWorkerSecret(e.target.value)} /></Field>
          <Button variant="secondary" disabled={busy || workerSecret.length < 32} onClick={async () => { const result = await run('worker-pair', { secret: workerSecret }); if (result) setWorkerSecret(''); }}><Check className="h-4 w-4" />Save Pairing Key</Button>
          {(data.workerDrafts || []).map(p => <div key={p.id} className="space-y-2 border-b border-slate-200 py-3"><label className="flex gap-2 font-semibold"><input type="checkbox" disabled={p.state !== 'approved'} checked={workerIds.includes(p.id)} onChange={() => setWorkerIds(old => old.includes(p.id) ? old.filter(id => id !== p.id) : [...old, p.id])} />{p.title} · {p.state}</label>
            {p.state === 'approved' && <div className="grid gap-2 sm:grid-cols-2"><Field label="Exact hosted artwork URL"><input className={inputClass} type="url" value={workerMedia[p.id] || ''} onChange={e => setWorkerMedia(old => ({ ...old, [p.id]: e.target.value }))} /></Field><Field label="Publish time (local)"><input className={inputClass} type="datetime-local" value={workerTimes[p.id] || ''} onChange={e => setWorkerTimes(old => ({ ...old, [p.id]: e.target.value }))} /></Field></div>}
          </div>)}
          <Button disabled={busy || !data.workerPaired || !workerIds.length} onClick={() => {
            try { const times = Object.fromEntries(workerIds.map(id => [id, new Date(workerTimes[id]).toISOString()])); run('worker-bundle', { ids: workerIds, mediaUrls: workerMedia, times }); }
            catch { setMessage('Choose a valid future publish time for every selected Pin.'); }
          }}><Download className="h-4 w-4" />Download Approved Handoff</Button>
        </div>
      </div>}
    </>}
  </section>;
}
