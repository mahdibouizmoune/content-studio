import { useState } from 'react';
import { Download, FlaskConical } from 'lucide-react';
import { Button, Field, inputClass } from '@/components/ui';

export default function PromptEvaluation({ data, versionId, busy, run }) {
  const [assignments, setAssignments] = useState({});
  const [budget, setBudget] = useState('1');
  return <section className="space-y-4 border-t border-slate-200 pt-5">
    <h3 className="text-base font-semibold">Fixed Evaluation Set</h3>
    <Field label="Estimated run cap (USD)"><input aria-label="Estimated run cap (USD)" className={`${inputClass} max-w-48`} type="number" min="0.01" max="25" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} /></Field>
    <div className="overflow-auto"><table className="w-full min-w-[550px] text-left text-sm"><thead><tr><th className="p-2">Case</th><th className="p-2">Source Article</th><th className="p-2">Review Focus</th></tr></thead><tbody>
      {(data.evaluationCases || []).map(c => <tr key={c.id} className="border-t border-slate-200"><td className="p-2 font-semibold">{c.name}</td><td className="p-2"><select aria-label={`Evaluation article: ${c.name}`} className={inputClass} value={assignments[c.id] || ''} onChange={e => setAssignments(current => ({ ...current, [c.id]: e.target.value }))}><option value="">Unassigned</option>{data.pipeline.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></td><td className="p-2 text-xs text-slate-500">{c.review}</td></tr>)}
    </tbody></table></div>
    <Button disabled={busy || !versionId || !Object.values(assignments).some(Boolean) || !(Number(budget) > 0 && Number(budget) <= 25)} onClick={() => run('evaluation-create', { versionId, budgetUsd: Number(budget), assignments: Object.entries(assignments).filter(([, articleId]) => articleId).map(([caseId, articleId]) => ({ caseId, articleId })) })}><FlaskConical size={16} />Queue Budgeted Evaluation</Button>
    {(data.evaluationRuns || []).map(evaluation => <section key={evaluation.id} className="space-y-3 border-t border-slate-200 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">{data.styleVersions.find(v => v.id === evaluation.versionId)?.name || 'Evaluation'} · {evaluation.assignments.length}/15 cases</h4><Button disabled={busy} variant="secondary" onClick={() => run('evaluation-export', { id: evaluation.id })}><Download size={16} />Export Report</Button></div>
      <p className="text-sm text-slate-500">Reserved/reconciled ${evaluation.committedUsd.toFixed(4)} · Estimated cap ${evaluation.budgetUsd.toFixed(2)}</p>
      <ul className="grid gap-2 text-sm md:grid-cols-2">{evaluation.results.filter(r => r.status !== 'unassigned').map(r => <li key={r.id} className="border-b border-slate-100 py-2"><span className="font-semibold">{r.name}</span> · {r.status}<span className="block text-xs text-slate-500">Recipe: {r.recipeStatus} · Text: {r.textStatus} · Visual: {r.visualStatus}</span></li>)}</ul>
    </section>)}
  </section>;
}
