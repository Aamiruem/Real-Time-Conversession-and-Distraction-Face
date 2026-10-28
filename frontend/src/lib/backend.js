// Shared backend status for the whole app: "checking" | "ok" | "outdated" | "offline" | "database"
// ("database" = the API answers but can't reach its database, e.g. the AWS RDS instance is stopped).
// One poller for every component (useSyncExternalStore); while the backend is down or out of date it re-checks
// every 5 s, so the app recovers by itself the moment the backend is (re)started.
import { useSyncExternalStore } from "react";

/** API version this frontend needs (backend/app/main.py → API_VERSION). */
export const REQUIRED_API_VERSION = 4;

let state = { status: "checking", version: null, checkedAt: 0 };
const listeners = new Set();
let timer = null;
let inflight = null;

const emit = (next) => {
  state = { ...state, ...next, checkedAt: Date.now() };
  listeners.forEach((l) => l());
};

export function checkBackend() {
  inflight ??= fetch("/api/health", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return emit({ status: "offline", version: null });
      const h = await res.json().catch(() => ({}));
      const version = h.api_version ?? 1; // backends from before versioning report none
      if (version < REQUIRED_API_VERSION) return emit({ status: "outdated", version });
      emit({ status: h.database?.connected === false ? "database" : "ok", version });
    })
    .catch(() => emit({ status: "offline", version: null }))
    .finally(() => {
      inflight = null;
      clearTimeout(timer);
      if (state.status !== "ok" && listeners.size) timer = setTimeout(checkBackend, 5000);
    });
  return inflight;
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) checkBackend();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) clearTimeout(timer);
  };
}

const SERVER_STATE = { status: "checking", version: null, checkedAt: 0 };

export function useBackendStatus() {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}
