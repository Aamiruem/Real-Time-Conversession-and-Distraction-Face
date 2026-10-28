import { useState } from "react";
import { checkBackend, REQUIRED_API_VERSION, useBackendStatus } from "@/lib/backend";

// run-backend.ps1 stops an old backend on port 8010 first; with the full path it works from any folder
const ROOT = import.meta.env.VITE_PROJECT_ROOT || "";
const COMMAND = `powershell -ExecutionPolicy Bypass -File "${ROOT ? `${ROOT}\\` : ".\\"}run-backend.ps1"`;

const COPY = {
  outdated: {
    icon: "🔄",
    tone: "warn",
    title: "Your backend is running an older version",
    text: (v) =>
      `It answers, but with API v${v ?? 1} — this app needs v${REQUIRED_API_VERSION} for the dashboard, Conversation ` +
      "Coach and Interview Prep. Restart it so it loads the latest code:",
    note: "Until then the dashboard is built from the data the old backend can still provide.",
  },
  offline: {
    icon: "🔌",
    tone: "bad",
    title: "Can't reach the backend",
    text: () => "The FastAPI server isn't answering on port 8010. Start it from the project folder:",
    note: "Pages that need data will fill in automatically as soon as it is running.",
  },
  database: {
    icon: "🗄️",
    tone: "bad",
    title: "The backend can't reach its database",
    text: () =>
      "The API is running, but its database isn't answering. If you use the AWS database, check that the RDS " +
      "instance is running and reachable, then see what the backend sees with (in the backend folder):",
    command: "python -m app.db_cli status",
    note: "This clears by itself as soon as the database answers again.",
  },
};

/** Friendly, actionable panel shown when the backend is offline or out of date (auto-rechecks every 5 s). */
export function BackendNotice() {
  const { status, version } = useBackendStatus();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const c = COPY[status];
  if (!c) return null;
  const command = c.command ?? COMMAND;

  const retry = async () => {
    setBusy(true);
    await checkBackend();
    setBusy(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the command is still selectable */
    }
  };

  return (
    <section className={`notice notice-${c.tone}`} role="status" aria-live="polite">
      <div className="notice-icon" aria-hidden="true">
        {c.icon}
      </div>
      <div className="notice-body">
        <h2>{c.title}</h2>
        <p>{c.text(version)}</p>
        <div className="notice-cmd">
          <code>{command}</code>
          <button className="btn ghost sm" onClick={copy}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <p className="small muted">
          {!c.command && (
            <>
              Paste it into any PowerShell window — it stops the old backend for you. Or run <code>.\start.ps1</code>{" "}
              in the project folder to start everything.{" "}
            </>
          )}
          {c.note}
        </p>
      </div>
      <div className="notice-side">
        <button className="btn sm" onClick={retry} disabled={busy}>
          {busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : "↻"} Check again
        </button>
        <span className="small muted">
          <span className="pulse-dot" /> re-checking every 5 s
        </span>
      </div>
    </section>
  );
}
