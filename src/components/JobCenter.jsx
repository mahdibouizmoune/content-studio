import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, CircleAlert, Clock3, ExternalLink, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { electronAPI } from "@/lib/electron";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState } from "@/components/ui";

const activeStatuses = new Set(["queued", "running", "cancelling", "interrupted"]);

function StatusIcon({ status }) {
  if (status === "completed") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (["failed", "interrupted"].includes(status)) return <CircleAlert className="h-5 w-5 text-rose-600" />;
  if (status === "cancelled") return <Ban className="h-5 w-5 text-slate-500" />;
  if (status === "running") return <LoaderCircle className="h-5 w-5 animate-spin text-violet-600" />;
  return <Clock3 className="h-5 w-5 text-amber-600" />;
}

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "Not recorded";
}

export default function JobCenter({ setActiveScreen }) {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const result = await electronAPI.getJobCenter?.();
    if (result?.success) setJobs(result.jobs || []);
  }, []);

  useEffect(() => {
    load();
    return electronAPI.onJobCenterUpdated?.((event) => setJobs(event?.jobs || []));
  }, [load]);

  const counts = useMemo(() => ({
    active: jobs.filter((job) => activeStatuses.has(job.status)).length,
    failed: jobs.filter((job) => ["failed", "interrupted"].includes(job.status)).length,
    completed: jobs.filter((job) => job.status === "completed").length
  }), [jobs]);

  async function cancel(job) {
    const result = await electronAPI.cancelJob?.(job.id);
    setStatus(result?.success ? "Cancellation requested." : result?.error || "This task is no longer active.");
    await load();
  }

  async function open(job) {
    await electronAPI.openJobWorkspace?.({ workspace: job.workspace });
    setActiveScreen(job.workspace || "diagnostics");
  }

  async function clearFinished() {
    const result = await electronAPI.clearFinishedJobs?.();
    setJobs(result?.jobs || []);
    setStatus("Finished job history cleared.");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SectionHeader
        eyebrow="System"
        title="Job Center"
        action={<div className="flex gap-2"><Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" />Refresh</Button><Button variant="danger" onClick={clearFinished} disabled={!jobs.some((job) => ["completed", "failed", "cancelled"].includes(job.status))}><Trash2 className="h-4 w-4" />Clear Finished</Button></div>}
      >
        Follow generation, publishing, hosting, and QA work from one place.
      </SectionHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        {[["Active", counts.active], ["Needs Attention", counts.failed], ["Completed", counts.completed]].map(([label, value]) => (
          <div key={label} className="soft-card rounded-lg p-4"><div className="text-2xl font-black text-slate-900">{value}</div><div className="text-sm font-bold text-slate-500">{label}</div></div>
        ))}
      </div>

      {status ? <div className="rounded-md bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700">{status}</div> : null}
      {!jobs.length ? <EmptyState title="No background jobs">New generation, publishing, and QA tasks will appear here.</EmptyState> : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <article key={job.id} className="soft-card rounded-lg p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <StatusIcon status={job.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-black text-slate-900">{job.label || job.type || "Background task"}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black uppercase text-slate-600">{job.status}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">Updated {dateLabel(job.updatedAt)}</div>
                  {job.error ? <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{job.error}</div> : null}
                  {job.status === "running" ? (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 transition-all" style={{ width: `${Math.max(3, Math.min(100, Number(job.progress || 0)))}%` }} /></div>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={() => open(job)}><ExternalLink className="h-4 w-4" />{["failed", "interrupted"].includes(job.status) ? "Retry" : "Open"}</Button>
                  {job.status === "running" ? <Button variant="danger" onClick={() => cancel(job)}><Ban className="h-4 w-4" />Cancel</Button> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
