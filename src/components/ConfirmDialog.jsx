import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

const ConfirmDialogContext = createContext(null);

export function ConfirmDialogProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);
  const previousFocusRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  const close = useCallback((confirmed) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(confirmed);
    window.setTimeout(() => previousFocusRef.current?.focus?.(), 0);
  }, []);

  const confirmAction = useCallback((options = {}) => {
    resolverRef.current?.(false);
    previousFocusRef.current = document.activeElement;
    setRequest({
      title: options.title || "Confirm action",
      message: options.message || "Are you sure you want to continue?",
      confirmLabel: options.confirmLabel || "Continue",
      cancelLabel: options.cancelLabel || "Cancel",
      tone: options.tone || "default"
    });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector(`[aria-labelledby="${titleId}"]`);
      const focusable = [...(dialog?.querySelectorAll("button:not(:disabled)") || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close, request, titleId]);

  useEffect(() => () => resolverRef.current?.(false), []);

  return (
    <ConfirmDialogContext.Provider value={confirmAction}>
      {children}
      {request && typeof document !== "undefined"
        ? createPortal(
          <div
            className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/55 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close(false);
            }}
          >
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${request.tone === "danger" ? "bg-rose-100 text-rose-700" : "bg-violet-100 text-violet-700"}`}>
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id={titleId} className="text-lg font-black text-slate-950">{request.title}</h2>
                  <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-600">{request.message}</p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button ref={cancelButtonRef} variant="secondary" onClick={() => close(false)}>
                  {request.cancelLabel}
                </Button>
                <Button variant={request.tone === "danger" ? "danger" : "primary"} onClick={() => close(true)}>
                  {request.confirmLabel}
                </Button>
              </div>
            </section>
          </div>,
          document.body
        )
        : null}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const confirmAction = useContext(ConfirmDialogContext);
  if (!confirmAction) throw new Error("useConfirmDialog must be used inside ConfirmDialogProvider.");
  return confirmAction;
}
