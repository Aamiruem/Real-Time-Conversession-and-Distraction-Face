// Client for the FastAPI backend. Requests go to /api/* on this origin (proxied by next.config.mjs).
const TOKEN_KEY = "focuslink.token";

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — session-only login */
  }
}

function message(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const field = String(e.loc?.[e.loc.length - 1] ?? "").replace(/_/g, " ");
        let msg = (e.msg ?? "").replace(/^Value error, /, "");
        if (msg.includes("pattern") && field === "phone") msg = "enter a valid mobile number with country code";
        if (msg.includes("pattern") && field === "username") msg = "use letters, numbers, dot, dash or underscore";
        return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${msg}`;
      })
      .join(" · ");
  }
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
  return "Something went wrong";
}

export async function api(path, init = {}) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running?", 0, null);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* non-JSON error */
    }
    if (res.status === 502 || res.status === 504 || (res.status === 500 && detail === "Internal Server Error")) {
      throw new ApiError(
        "Backend not reachable — start it from backend/ with: uvicorn app.main:app --port 8010",
        res.status,
        detail,
      );
    }
    throw new ApiError(message(detail), res.status, detail);
  }
  return res.status === 204 ? undefined : await res.json();
}

// ---------------------------------------------------------------- types used across pages

/** Backend timestamps are UTC; SQLite returns them without an offset. */
export const toDate = (s) => new Date(/(Z|[+-]\d\d:\d\d)$/.test(s) ? s : `${s}Z`);
