import { ArrowRight, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { electronAPI } from '@/lib/electron';

export default function WebsitePerformance({ onChoose, actionLabel = 'Research Topic', onSettings }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    electronAPI.getGoogleAnalyticsWorkspace?.().then((value) => { if (active) setData(value); }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);
  async function refresh() {
    setBusy(true); setError('');
    try {
      const result = await electronAPI.refreshGoogleAnalytics();
      if (!result?.success) throw new Error(result?.error || 'Analytics could not be refreshed.');
      setData(result);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <div className="mb-6 border-y border-slate-200 py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-black text-slate-900">Best Performing Articles</h2><p className="mt-1 text-sm font-medium text-slate-500">{data?.snapshot ? `${data.snapshot.range.current.startDate} to ${data.snapshot.range.current.endDate} / GA4 landing-page sessions${data.snapshot.timeZone ? ` / ${data.snapshot.timeZone}` : ''}` : 'Google Analytics reports are not connected.'}</p></div>
      <div className="flex gap-2"><Button variant="secondary" onClick={refresh} disabled={busy || !data?.configured}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Refreshing...' : 'Refresh Analytics'}</Button>{onSettings && !data?.snapshot ? <Button variant="secondary" onClick={onSettings}>Analytics Settings</Button> : null}</div>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p> : null}
    {data?.stale || data?.limited ? <p className="mt-3 text-sm font-bold text-amber-700">{data.stale ? 'Report is more than a week old. Refresh before expanding clusters.' : 'Google limited this report. These results are not used as proven evidence.'}</p> : null}
    {data?.snapshot && !data.recommendations?.length ? <p className="mt-3 text-sm text-slate-600">No traffic matched your saved article addresses in this report.</p> : null}
    {data?.recommendations?.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Article</th><th className="p-2">Sessions</th><th className="p-2">Engaged</th><th className="p-2">Avg. Engagement</th><th className="p-2">Pinterest</th><th className="p-2">Growth</th><th className="p-2"></th></tr></thead><tbody className="divide-y divide-slate-100">{data.recommendations.slice(0, 10).map((item) => <tr key={item.url}><td className="max-w-80 py-3 pr-4"><div className="font-bold text-slate-900">{item.title}</div><p className="mt-1 text-xs text-slate-500">{item.reason}</p></td><td className="p-2">{item.sessions}</td><td className="p-2">{Math.round(item.engagementRate * 100)}%</td><td className="p-2">{item.averageEngagementSeconds}s</td><td className="p-2">{item.pinterestSessions}</td><td className="p-2">{item.growthPercent === null ? 'Limited baseline' : `${item.growthPercent > 0 ? '+' : ''}${item.growthPercent}%`}</td><td className="p-2"><Button variant="secondary" onClick={() => onChoose(item)} disabled={busy}><ArrowRight className="h-4 w-4" />{actionLabel}</Button></td></tr>)}</tbody></table></div> : null}
  </div>;
}
