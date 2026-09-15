import { Component } from "react";
import { Clipboard, FileText, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { electronAPI } from "@/lib/electron";
import { buildSanitizedErrorReport } from "@/lib/sanitizeError.mjs";

function RestoreWorkspaceButton({ onRestore }) {
  const confirmAction = useConfirmDialog();

  async function confirmRestore() {
    const confirmed = await confirmAction({
      title: "Restore latest backup",
      message: "A safety backup of the current workspace will be created first.",
      confirmLabel: "Restore Backup",
      tone: "danger"
    });
    if (confirmed) onRestore();
  }

  return (
    <Button variant="danger" onClick={confirmRestore}>
      <RotateCcw className="h-4 w-4" />Restore Latest Backup
    </Button>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      report: "",
      backupAvailable: false,
      status: ""
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const report = buildSanitizedErrorReport(error, info?.componentStack || "");
    this.setState({ report });
    electronAPI.reportRendererError?.(report).catch(() => {});
    electronAPI.getWorkspaceBackupStatus?.()
      .then((result) => this.setState({ backupAvailable: Boolean(result?.count) }))
      .catch(() => {});
  }

  reload = () => {
    window.location.reload();
  };

  returnToArticles = () => {
    if (this.props.onReturnArticles) {
      this.setState({ error: null, report: "", status: "" });
      this.props.onReturnArticles();
      return;
    }
    window.location.reload();
  };

  copyReport = async () => {
    try {
      if (electronAPI.copyText) await electronAPI.copyText(this.state.report);
      else await navigator.clipboard.writeText(this.state.report);
      this.setState({ status: "Sanitized error details copied." });
    } catch {
      this.setState({ status: "Could not copy automatically. Open the log folder for details." });
    }
  };

  restoreBackup = async () => {
    const result = await electronAPI.restoreLatestWorkspaceBackup?.();
    if (!result?.success) {
      this.setState({ status: result?.error || "Could not restore the workspace backup." });
      return;
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-[70vh] place-items-center p-4">
        <section className="w-full max-w-2xl rounded-lg border border-rose-200 bg-white p-6 shadow-panel" role="alert">
          <div className="text-sm font-black uppercase text-rose-600">Screen recovery</div>
          <h1 className="mt-2 text-2xl font-black text-slate-950">This screen could not finish loading</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Your saved articles and settings were not deleted. Reload this screen, return to Articles, or open the logs for support.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={this.reload}><RotateCcw className="h-4 w-4" />Reload Screen</Button>
            <Button variant="secondary" onClick={this.returnToArticles}><Undo2 className="h-4 w-4" />Return to Articles</Button>
            <Button variant="secondary" onClick={this.copyReport}><Clipboard className="h-4 w-4" />Copy Error Details</Button>
            <Button variant="secondary" onClick={() => electronAPI.openLogsFolder?.()}><FileText className="h-4 w-4" />Open Logs Folder</Button>
            {this.state.backupAvailable ? (
              <RestoreWorkspaceButton onRestore={this.restoreBackup} />
            ) : null}
          </div>
          {this.state.status ? <div className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">{this.state.status}</div> : null}
          {this.state.report ? (
            <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-black text-slate-700">View Error Details</summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs font-semibold text-slate-600">{this.state.report}</pre>
            </details>
          ) : null}
        </section>
      </main>
    );
  }
}
