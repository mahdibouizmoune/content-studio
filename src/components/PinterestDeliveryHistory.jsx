import { useEffect, useState } from 'react';
import { Download, FolderOpen, RefreshCw, Save } from 'lucide-react';
import { Button, inputClass } from '@/components/ui';
import { electronAPI } from '@/lib/electron';

const labels = { pending: 'Pending confirmation', confirmed: 'Confirmed', failed: 'Failed', review: 'Needs review' };

export default function PinterestDeliveryHistory({ refreshKey, onRetry, disabled }) {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState({});
  const [receipt, setReceipt] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const batch = batches.find((item) => item.id === selectedId);

  useEffect(() => {
    let active = true;
    electronAPI.getPinterestDelivery().then((result) => {
      if (!active) return;
      setBatches(result.batches || []);
      setSelectedId((current) => result.batches?.some((item) => item.id === current) ? current : result.batches?.[0]?.id || '');
    }).catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [refreshKey, reload]);

  useEffect(() => {
    setDraft({});
    setReceipt('');
  }, [selectedId]);

  async function matchReceipt() {
    setBusy(true);
    try {
      const result = await electronAPI.suggestPinterestResults({ batchId: batch.id, text: receipt });
      setDraft((current) => ({ ...current, ...Object.fromEntries(result.updates.map((update) => [update.number, update.status])) }));
      setMessage(`${result.updates.length} error rows matched. ${result.ambiguous} ambiguous matches. Unmatched rows remain unchanged. Review and save results.`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function saveResults() {
    setBusy(true);
    try {
      const updated = await electronAPI.savePinterestResults({ batchId: batch.id, revision: batch.revision,
        updates: Object.entries(draft).map(([number, status]) => ({ number: Number(number), status })), evidence: receipt });
      setBatches((current) => current.map((item) => item.id === updated.id ? updated : item));
      setDraft({});
      setMessage('Reported import results saved.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  const counts = batch?.rows.reduce((total, row) => {
    const status = batch.outcomes[row.number]?.status || 'pending';
    total[status] = (total[status] || 0) + 1;
    return total;
  }, {}) || {};

  return <section className="mb-5 border-y border-slate-200 py-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-black text-slate-900">Pinterest Import History</h2>
      <Button variant="secondary" onClick={() => { setDraft({}); setReload((value) => value + 1); }} disabled={busy || disabled} title="Reload saved batches"><RefreshCw className="h-4 w-4" />Refresh</Button>
    </div>
    {batches.length ? <>
      <select className={`${inputClass} w-full`} aria-label="Export batch" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy || disabled}>
        {batches.map((item) => <option key={item.id} value={item.id}>{item.account || "Unassigned account"} | {new Date(item.createdAt).toLocaleString()} | {item.rows.length} Pins | {item.id.slice(0, 8)}</option>)}
      </select>
      {batch ? <>
        <p className="my-3 text-sm text-slate-600">{counts.confirmed || 0} confirmed / {counts.failed || 0} failed / {(counts.pending || 0) + (counts.review || 0)} unresolved. Files: {batch.fileStatus}.</p>
        {batch.error ? <p className="mb-3 break-words text-sm text-rose-600">{batch.error}</p> : null}
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b border-slate-200"><th className="p-2">Row</th><th className="p-2">Pin</th><th className="p-2">Reported outcome</th></tr></thead>
            <tbody>{batch.rows.map((row) => <tr key={row.number} className="border-b border-slate-200">
              <td className="p-2">{row.number}</td><td className="max-w-sm break-words p-2">{row.cells[0]}<span className="block text-xs text-slate-500">{row.cells[2]}</span></td>
              <td className="w-56 p-2"><select className={`${inputClass} w-full`} aria-label={`Row ${row.number} outcome`} value={draft[row.number] || batch.outcomes[row.number]?.status || 'pending'} onChange={(event) => setDraft((current) => ({ ...current, [row.number]: event.target.value }))} disabled={busy || disabled}>
                {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></td>
            </tr>)}</tbody>
          </table>
        </div>
        <label className="mt-3 block text-sm font-bold text-slate-700">Pinterest email or import receipt
          <textarea className={`${inputClass} mt-1 min-h-24 w-full`} maxLength={100000} value={receipt} onChange={(event) => setReceipt(event.target.value)} disabled={busy || disabled} />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => electronAPI.revealPinterestExport({ batchId: batch.id }).catch((error) => setMessage(error.message))} disabled={busy || disabled}><FolderOpen className="h-4 w-4" />Show CSV</Button>
          <Button variant="secondary" onClick={matchReceipt} disabled={busy || disabled || !receipt.trim()}><RefreshCw className="h-4 w-4" />Match Error Rows</Button>
          <Button onClick={saveResults} disabled={busy || disabled || !Object.keys(draft).length}><Save className="h-4 w-4" />Save Results</Button>
          <Button variant="secondary" onClick={() => onRetry(batch.id)} disabled={busy || disabled || !counts.failed || !!Object.keys(draft).length}><Download className="h-4 w-4" />Retry Failed Only</Button>
        </div>
      </> : null}
    </> : <p className="text-sm text-slate-500">No saved export batches.</p>}
    {message ? <p role="status" className="mt-3 break-words text-sm text-slate-600">{message}</p> : null}
  </section>;
}
