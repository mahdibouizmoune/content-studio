import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Download, FileText, FlaskConical, GitBranch, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { electronAPI } from '@/lib/electron';
import SectionHeader from '@/components/SectionHeader';
import VirtualList from '@/components/VirtualList';
import { Button, Field, inputClass } from '@/components/ui';
const tabs = ['Pipeline', 'Recipes', 'Prompt Lab', 'Experiments', 'Costs', 'Recipe Packs'];
const money = n => n == null ? 'Unknown' : `$${Number(n).toFixed(4)}`;
export default function ContentOperations({ activeScreen, setActiveScreen, refreshArticles }) {
  const [data, setData] = useState(null), [tab, setTab] = useState('Pipeline'), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [query, setQuery] = useState(''), [articleId, setArticleId] = useState(''), [recipes, setRecipes] = useState([]), [sourceHash, setSourceHash] = useState('');
  const [history, setHistory] = useState([]);
  const [styleId, setStyleId] = useState(''), [versionId, setVersionId] = useState(''), [candidateName, setCandidateName] = useState(''), [prompt, setPrompt] = useState(''), [pinId, setPinId] = useState(''), [note, setNote] = useState('');
  const [experimentName, setExperimentName] = useState(''), [variants, setVariants] = useState([{ pinId: '', remotePinId: '' }, { pinId: '', remotePinId: '' }]);
  const [requestId, setRequestId] = useState(''), [evidence, setEvidence] = useState(''), [packName, setPackName] = useState('Weekly Recipe Pack'), [packIds, setPackIds] = useState([]), [multiplier, setMultiplier] = useState('1');
  const load = useCallback(async () => { const r = await electronAPI.qualityWorkspace('content:snapshot'); if (!r.success) throw new Error(r.error); setData(r.result); return r.result; }, []);
  useEffect(() => { if (!activeScreen || activeScreen === 'content-pipeline') load().catch(e => setMessage(e.message)); }, [activeScreen, load]);
  async function run(action, params = {}) {
    setBusy(true); setMessage('');
    try { const r = await electronAPI.qualityWorkspace(`content:${action}`, params); if (!r.success) throw new Error(r.error); await load(); setMessage(r.result?.canceled ? 'Download cancelled.' : r.result?.path ? `Saved: ${r.result.path}` : 'Saved.'); return r.result; }
    catch (error) { setMessage(error.message); return null; } finally { setBusy(false); }
  }
  const chooseArticle = async id => { setArticleId(id); setRecipes([]); setSourceHash(''); setHistory([]); if (!id) return; const r = await run('recipe-open', { articleId: id }); if (r) { setRecipes(r.recipes); setSourceHash(r.sourceHash); setHistory(r.previous?.history || []); } };
  const updateRecipe = (index, key, value) => setRecipes(current => current.map((r, i) => i === index ? { ...r, [key]: value } : r));
  const articlePicker = <Field label="Saved article"><select aria-label="Saved article" className={inputClass} value={articleId} onChange={e => chooseArticle(e.target.value)} disabled={busy}><option value="">Choose article</option>{data?.pipeline.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></Field>;
  const pinOptions = data?.pins.map(p => <option key={p.id} value={p.id}>{p.title || p.id}</option>);
  return <section className="space-y-5" aria-busy={busy}>
    <SectionHeader eyebrow="Create" title="Content Pipeline" action={<Button variant="secondary" disabled={busy} onClick={() => load().catch(e => setMessage(e.message))}><RefreshCw size={16} />Refresh</Button>} />
    <div role="tablist" aria-label="Content operations" className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">{tabs.map(t => <button type="button" key={t} role="tab" aria-selected={tab === t} className={`rounded px-3 py-2 text-sm font-semibold ${tab === t ? 'bg-emerald-700 text-white' : 'text-slate-600'}`} onClick={() => setTab(t)}>{t}</button>)}</div>
    {message && <p role="status" className="break-words rounded-md border border-slate-200 p-3 text-sm">{message}</p>}
    {!data ? <p>No desktop content workspace loaded.</p> : <>
      {tab === 'Pipeline' && <div className="space-y-4">
        <input aria-label="Find content" placeholder="Find an article..." className={inputClass} value={query} onChange={e => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setActiveScreen('pin-creator')}><ArrowRight size={16} />Pinterest</Button><Button variant="secondary" onClick={() => setActiveScreen('meta-studio')}><ArrowRight size={16} />Meta</Button><Button variant="secondary" onClick={() => setActiveScreen('quality-studio')}><Check size={16} />Quality Studio</Button></div>
        <VirtualList items={data.pipeline.filter(a => a.title.toLowerCase().includes(query.toLowerCase()))} label="Connected articles" estimateSize={170}>{a => <article className="border-b border-slate-200 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{a.title}</h3><p className={`mt-1 text-xs ${a.sourceState === 'source-changed' ? 'text-amber-700' : 'text-slate-500'}`}>{a.queueStatus} · {a.recipeCount} recipes · {a.sourceState === 'source-changed' ? 'Source changed: review related Pins and captions' : a.sourceState === 'current' ? 'Source matches checkpoint' : 'No source checkpoint'}</p>{a.url && <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-emerald-700">{a.url}</a>}</div>
            <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={async () => { setTab('Recipes'); await chooseArticle(a.id); }}><FileText size={16} />Recipe</Button><Button variant="secondary" disabled={busy} onClick={() => run('baseline', { articleId: a.id })}><GitBranch size={16} />Record Checkpoint</Button></div></div>
          {a.artworkState === 'artwork-changed' && <p className="mt-2 text-xs text-amber-700">Artwork changed: review linked drafts and exported files.</p>}
          <details className="mt-3 text-sm"><summary className="cursor-pointer text-slate-600">{a.pins.length} Pins · {a.meta.length} Meta drafts · {a.deliveries.length} export rows</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">{a.pins.map(p => <li key={p.id}>Pin: {p.title || p.id} · {p.status} · {p.style}</li>)}{a.meta.map(p => <li key={p.id}>Meta: {p.title || p.id} · {p.status}</li>)}{a.deliveries.map(r => <li key={`${r.batchId}-${r.number}`}>CSV {r.batchId.slice(0, 8)} · Row {r.number} · {r.status}</li>)}</ul>
          </details>
        </article>}</VirtualList>
        {!data.pipeline.length && <p className="text-sm text-slate-500">No saved articles.</p>}
      </div>}
      {tab === 'Recipes' && <div className="space-y-5">{articlePicker}
        {history.length > 0 && <Field label="Load previous recipe draft"><select aria-label="Load previous recipe draft" className={inputClass} value="" onChange={e => { const previous = history.find(h => String(h.revision) === e.target.value); if (previous) setRecipes(previous.recipes); }}><option value="">Choose saved revision</option>{history.map(h => <option key={h.revision} value={h.revision}>Revision {h.revision}</option>)}</select></Field>}
        {recipes.map((r, index) => <fieldset key={index} className="space-y-3 border-b border-slate-200 pb-5"><legend className="mb-3 font-semibold">Recipe {index + 1}</legend>
          <Field label={`Recipe ${index + 1} name`}><input className={inputClass} value={r.name} onChange={e => updateRecipe(index, 'name', e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{['Prep Time', 'Cook Time', 'Total Time', 'Servings'].map(k => <Field key={k} label={`${k} ${index + 1}`}><input className={inputClass} value={r.facts[k] || ''} onChange={e => updateRecipe(index, 'facts', { ...r.facts, [k]: e.target.value })} /></Field>)}</div>
          <div className="grid gap-4 md:grid-cols-2"><Field label={`Ingredients ${index + 1}`}><textarea rows={8} className={inputClass} value={r.ingredients.join('\n')} onChange={e => updateRecipe(index, 'ingredients', e.target.value.split('\n'))} /></Field><Field label={`Instructions ${index + 1}`}><textarea rows={8} className={inputClass} value={r.instructions.join('\n')} onChange={e => updateRecipe(index, 'instructions', e.target.value.split('\n'))} /></Field></div>
          <Button variant="ghost" title="Remove recipe from draft" aria-label={`Remove recipe ${index + 1}`} onClick={() => setRecipes(current => current.filter((_, i) => i !== index))}><Trash2 size={16} /></Button>
        </fieldset>)}
        {sourceHash && <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setRecipes(current => [...current, { name: '', facts: {}, ingredients: [''], instructions: [''] }])}><Plus size={16} />Add Recipe</Button><Button disabled={busy || !recipes.length} onClick={async () => { const r = await run('recipe-save', { articleId, sourceHash, recipes: recipes.map(r => ({ ...r, ingredients: r.ingredients.map(s => s.trim()).filter(Boolean), instructions: r.instructions.map(s => s.trim()).filter(Boolean) })) }); if (r) { setSourceHash(r.article.recipeRecord.sourceHash); setHistory(r.article.recipeRecord.history || []); await refreshArticles?.(); setMessage('Local recipe draft saved and marked for review. Published posts were not changed.'); } }}><Save size={16} />Save Recipe Draft</Button></div>}
      </div>}
      {tab === 'Prompt Lab' && <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2"><Field label="Base Pin style"><select aria-label="Base Pin style" className={inputClass} value={styleId} onChange={e => { const s = data.styles.find(s => s.id === e.target.value); setStyleId(e.target.value); setPrompt(s?.prompt || ''); }}><option value="">Choose style</option>{data.styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Candidate name"><input className={inputClass} value={candidateName} onChange={e => setCandidateName(e.target.value)} /></Field></div>
        <Field label="Candidate prompt"><textarea aria-label="Candidate prompt" rows={8} maxLength={12000} className={inputClass} value={prompt} onChange={e => setPrompt(e.target.value)} /></Field>
        <Button disabled={busy || !styleId || !prompt.trim() || !candidateName.trim()} onClick={async () => { const v = await run('style-save', { styleId, name: candidateName, prompt }); if (v) setVersionId(v.id); }}><Save size={16} />Save Immutable Candidate</Button>
        <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2"><Field label="Benchmark version"><select aria-label="Benchmark version" className={inputClass} value={versionId} onChange={e => setVersionId(e.target.value)}><option value="">Choose version</option>{data.styleVersions.map(v => <option key={v.id} value={v.id}>{v.name} · v{v.version} · locked</option>)}</select></Field>{articlePicker}</div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !versionId || !articleId} onClick={() => run('benchmark-queue', { versionId, articleId })}><Plus size={16} />Queue Test Pin</Button><Button variant="secondary" onClick={() => setActiveScreen('pin-creator')}><ArrowRight size={16} />Open Pin Creator</Button></div>
        <Field label="Finished benchmark Pin"><select aria-label="Finished benchmark Pin" className={inputClass} value={pinId} onChange={e => setPinId(e.target.value)}><option value="">Choose saved output</option>{pinOptions}</select></Field>
        <Field label="Review notes"><input className={inputClass} value={note} onChange={e => setNote(e.target.value)} /></Field>
        <Button disabled={busy || !versionId || !articleId || !pinId} onClick={() => run('benchmark-save', { versionId, articleId, pinId, note })}><FlaskConical size={16} />Record Benchmark</Button>
        {data.benchmarkCases.map(c => <div key={c.id} className="border-b border-slate-200 py-2 text-sm">{data.styleVersions.find(v => v.id === c.versionId)?.name} · {c.recipeStatus} · Text: {c.textStatus} · Realism: {c.realism}<p className="text-xs text-slate-500">{c.note}</p></div>)}
      </div>}
      {tab === 'Experiments' && <div className="space-y-4">
        <Field label="Experiment name"><input className={inputClass} value={experimentName} onChange={e => setExperimentName(e.target.value)} /></Field>
        {variants.map((v, i) => <div key={i} className="grid gap-3 md:grid-cols-2"><Field label={`Variant ${i + 1}`}><select aria-label={`Variant ${i + 1}`} className={inputClass} value={v.pinId} onChange={e => setVariants(current => current.map((x, j) => j === i ? { ...x, pinId: e.target.value } : x))}><option value="">Choose Pin</option>{pinOptions}</select></Field><Field label={`Pinterest Pin ID ${i + 1}`}><input className={inputClass} value={v.remotePinId} onChange={e => setVariants(current => current.map((x, j) => j === i ? { ...x, remotePinId: e.target.value } : x))} /></Field></div>)}
        <Button disabled={busy || !experimentName || variants.some(v => !v.pinId || !v.remotePinId)} onClick={() => run('experiment-save', { name: experimentName, variants })}><Save size={16} />Save Comparison</Button>
        <p className="text-xs text-slate-500">Analytics snapshot: {data.metricsFetchedAt || 'Not imported'}</p>
        {data.experiments.map(e => <div key={e.id} className="border-t border-slate-200 py-3"><h3 className="font-semibold">{e.name} · {e.status}</h3>{e.variants.map(v => <p key={v.remotePinId} className="mt-1 text-sm">{v.label} · {v.evidence} · {v.impressions} impressions · {v.clicks} outbound clicks · CTR {v.ctr == null ? 'Unavailable' : `${(v.ctr * 100).toFixed(2)}%`}</p>)}<p className="mt-2 text-xs text-slate-500">{e.limitation}</p></div>)}
        {data.events && <details className="border-t border-slate-200 pt-3"><summary>Measured recipe interactions</summary>{data.events.rows.map((r, i) => <p key={i} className="break-words text-xs">{r.path} · {r.creative || 'Unattributed'} · {r.event}: {r.count}</p>)}</details>}
      </div>}
      {tab === 'Costs' && <div className="space-y-5">
        {data.costs.map(g => <div key={g.articleId} className="border-b border-slate-200 py-3"><h3 className="font-semibold">{g.title}</h3><p className="text-sm">{g.requests} requests · Reserved/reconciled {money(g.reserved)} · Receipt-reported {money(g.reported)} · {g.usablePins} visually reviewed Pins · Per reviewed Pin {money(g.costPerUsablePin)} · Per approved article {money(g.costPerApprovedArticle)}</p><p className="text-xs text-slate-500">{g.unknown} requests have no actual-charge receipt.</p></div>)}
        <div className="grid gap-4 md:grid-cols-2">{articlePicker}<Field label="Generation request"><select aria-label="Generation request" className={inputClass} value={requestId} onChange={e => setRequestId(e.target.value)}><option value="">Choose request</option>{data.spending.map(e => <option key={e.id} value={e.id}>{e.model} · {e.predictionId || e.id}</option>)}</select></Field></div>
        <Field label="Attribution evidence"><input className={inputClass} value={evidence} onChange={e => setEvidence(e.target.value)} /></Field>
        <Button disabled={busy || !articleId || !requestId || !evidence.trim()} onClick={() => run('cost-link', { articleId, requestId, evidence })}><Save size={16} />Link Request to Article</Button>
        <Field label="Existing finished Pin"><select aria-label="Existing finished Pin" className={inputClass} value={pinId} onChange={e => setPinId(e.target.value)}><option value="">Choose saved Pin</option>{pinOptions}</select></Field>
        <Button variant="secondary" disabled={busy || !articleId || !pinId} onClick={async () => { const r = await run('reuse-pin', { articleId, pinId }); if (r) { setMessage('Existing finished Pin verified. No AI generation was submitted.'); setActiveScreen('pin-creator'); } }}><Check size={16} />Use Existing Pin</Button>
      </div>}
      {tab === 'Recipe Packs' && <div className="space-y-4">
        <Field label="Recipe pack name"><input className={inputClass} value={packName} onChange={e => setPackName(e.target.value)} /></Field>
        <div className="max-h-80 overflow-auto">{data.pipeline.map(a => <label key={a.id} className="flex items-start gap-3 border-b border-slate-200 py-3 text-sm"><input type="checkbox" checked={packIds.includes(a.id)} onChange={() => setPackIds(current => current.includes(a.id) ? current.filter(id => id !== a.id) : [...current, a.id])} /><span>{a.title} · {a.recipeCount} recipes</span></label>)}</div>
        <Field label="Shopping-list serving multiplier"><input type="number" min="0.25" max="20" step="0.25" className={inputClass} value={multiplier} onChange={e => setMultiplier(e.target.value)} /></Field>
        <Button disabled={busy || !packIds.length || packIds.length > 7} onClick={() => run('pack-export', { ids: packIds, name: packName, multiplier: Number(multiplier) })}><Download size={16} />Download Weekly Recipe Pack</Button>
        {data.packs.map(p => <p key={p.id} className="border-t border-slate-200 py-2 text-sm">{p.name} · {p.ids.length} articles · {new Date(p.createdAt).toLocaleString()}</p>)}
      </div>}
    </>}
  </section>;
}
