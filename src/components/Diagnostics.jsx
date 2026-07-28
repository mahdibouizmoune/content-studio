import { useEffect, useState } from "react";
import { Clipboard, FolderOpen, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { electronAPI } from "@/lib/electron";
import { sanitizeErrorDetails } from "@/lib/sanitizeError.mjs";

const connectionLabels = {
  replicate: "Replicate",
  imgbb: "ImgBB",
  wordpress: "WordPress",
  impact: "Impact",
  amazon: "Amazon Associates",
  goHighLevel: "GoHighLevel",
  googleSearchConsole: "Google Search Console",
  pinterestAnalytics: "Pinterest Analytics"
};

export default function Diagnostics() {
  const confirmAction = useConfirmDialog();
  const [diagnostics, setDiagnostics] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setBusy("load");
    try {
      const result = await electronAPI.getDiagnostics();
      setDiagnostics(result);
      setStatus(result?.success ? "Diagnostics refreshed." : result?.error || "Could not load diagnostics.");
    } catch (error) {
      setStatus(error.message || "Could not load diagnostics.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function copyReport() {
    const report = sanitizeErrorDetails(JSON.stringify(diagnostics || {}, null, 2));
    try {
      await navigator.clipboard.writeText(report);
      setStatus("Sanitized diagnostic report copied.");
    } catch {
      setStatus("Could not copy the report. Open the logs folder instead.");
    }
  }

  async function restoreBackup() {
    if (!await confirmAction({
      title: "Restore latest backup",
      message: "The current workspace will be backed up first, then replaced with the latest valid backup.",
      confirmLabel: "Restore Backup",
      tone: "danger"
    })) return;
    setBusy("restore");
    const result = await electronAPI.restoreLatestWorkspaceBackup();
    if (result?.success) window.location.reload();
    setStatus(result?.error || "Could not restore the workspace backup.");
    setBusy("");
  }

  async function clearCache() {
    setBusy("cache");
    const result = await electronAPI.clearTemporaryMediaCache();
    setStatus(result?.success ? "Temporary media cache cleared. Generated images were not removed." : result?.error || "Could not clear temporary media cache.");
    setBusy("");
  }

  if (!diagnostics) {
    return <div className="text-sm font-semibold text-slate-600">{busy ? "Loading diagnostics..." : status || "Diagnostics are unavailable."}</div>;
  }

  const infoRows = [
    ["App version", diagnostics.appVersion],
    ["Electron", diagnostics.electronVersion],
    ["Operating system", diagnostics.operatingSystem],
    ["User data", diagnostics.userDataPath],
    ["Logs", diagnostics.logsPath],
    ["Settings storage", diagnostics.settingsStorage?.ok ? "Healthy" : "Needs attention"],
    ["Store schema", diagnostics.settingsSchemaVersion],
    ["Encrypted storage", diagnostics.safeStorageAvailable ? "Available" : "Unavailable"]
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {infoRows.map(([label, value]) => (
          <div key={label} className="border-b border-slate-100 pb-2">
            <div className="text-xs font-black uppercase text-slate-500">{label}</div>
            <div className="mt-1 break-all text-sm font-semibold text-slate-800">{String(value ?? "Not available")}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 text-sm font-black text-slate-900">Connections</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(connectionLabels).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-100">
              <span>{label}</span>
              <span className={diagnostics.connections?.[key] ? "text-emerald-700" : "text-slate-400"}>
                {diagnostics.connections?.[key] ? "Configured" : "Not set"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-sm font-semibold text-slate-600">
        Latest backup: {diagnostics.latestBackup?.available ? new Date(diagnostics.latestBackup.createdAt).toLocaleString() : "No valid backup found"}
      </div>

      <div className="text-sm font-semibold text-slate-600">
        Feature flags: {Object.keys(diagnostics.featureFlags || {}).length
          ? Object.entries(diagnostics.featureFlags).map(([key, value]) => `${key}: ${value ? "on" : "off"}`).join(", ")
          : "No optional features enabled"}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={load} disabled={!!busy}><RefreshCw className="h-4 w-4" />Refresh</Button>
        <Button variant="secondary" onClick={copyReport}><Clipboard className="h-4 w-4" />Copy Sanitized Report</Button>
        <Button variant="secondary" onClick={() => electronAPI.openLogsFolder()}><FolderOpen className="h-4 w-4" />Open Logs Folder</Button>
        <Button variant="secondary" onClick={clearCache} disabled={!!busy}><Trash2 className="h-4 w-4" />Clear Temporary Cache</Button>
        <Button variant="danger" onClick={restoreBackup} disabled={busy === "restore" || !diagnostics.latestBackup?.available}>
          <RotateCcw className="h-4 w-4" />Restore Latest Backup
        </Button>
      </div>
      {status ? <div className="rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
    </div>
  );
}
