import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { ConfirmDialogProvider } from "@/components/ConfirmDialog";
import ErrorBoundary from "@/components/ErrorBoundary";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfirmDialogProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ConfirmDialogProvider>
  </React.StrictMode>
);
