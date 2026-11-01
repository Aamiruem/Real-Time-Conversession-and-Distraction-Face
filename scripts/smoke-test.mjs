// End-to-end check of a running Presence AI: pages, API, login-free guest access, chat over WebSocket.
//   node scripts/smoke-test.mjs https://your-app.vercel.app      (a deployment)
//   node scripts/smoke-test.mjs http://127.0.0.1:4173            (local: cd frontend; npx vite preview --port 4173)
// Exits 1 if anything fails, so CI marks the deployment as broken. Needs Node 22+ (built-in fetch + WebSocket).
const base = (process.argv[2] || process.env.SMOKE_URL || "").replace(/\/$/, "");
if (!base) {
  console.error("Usage: node scripts/smoke-test.mjs <site url>");
  process.exit(2);
}

const results = [];
async function check(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - start, detail });
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - start, detail: e.message });
  }
}

/** fetch with a timeout; the API may need ~50 s to wake up on free hosting */
async function get(path, init = {}, timeoutMs = 90_000) {
  const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 160)}`);
  return text;
}
const json = async (path, init) => JSON.parse(await get(path, init));
const title = (html) => html.match(/<title>([^<]*)/)?.[1] ?? "(no title)";

let token = null;
let user = null;

await check("Landing page", async () => {
  const html = await get("/");
  if (!html.includes("Presence AI")) throw new Error(`unexpected page: ${title(html)}`);
  return title(html);
});

await check("App page (/app/rooms)", async () => {
  const html = await get("/app/rooms");
  if (!/<script/.test(html)) throw new Error("no app script in the page");
  return title(html);
});

await check("API health", async () => {
  const h = await json("/api/health");
  if (h.status !== "ok") throw new Error(`status ${h.status}, database ${JSON.stringify(h.database)}`);
  return `v${h.api_version} · ${h.database.engine} (${h.database.location}) · mongodb ${
    h.mongodb.enabled ? (h.mongodb.connected ? "connected" : "NOT connected") : "off"
  }`;
});

await check("Open without login (guest)", async () => {
  const t = await json("/api/auth/guest", { method: "POST" });
  if (!t.access_token) throw new Error("no token returned");
  token = t.access_token;
  user = t.user;
  return `signed in as ${user.username}`;
});

const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

await check("Logged-in API (/api/auth/me)", async () => {
  if (!token) throw new Error("skipped: no guest token");
  const me = await json("/api/auth/me", auth());
  if (me.username !== user.username) throw new Error(`got ${me.username}`);
  return me.username;
});

let roomId = null;
await check("Focus rooms list", async () => {
  if (!token) throw new Error("skipped: no guest token");
  const rooms = await json("/api/rooms", auth());
  roomId = rooms[0]?.id ?? null;
  return `${rooms.length} room(s)`;
});

await check("Recordings API", async () => {
  if (!token) throw new Error("skipped: no guest token");
  const recs = await json("/api/recordings", auth());
  return `${recs.length} recording(s)`;
});

await check("Live chat (WebSocket)", async () => {
  if (!token) throw new Error("skipped: no guest token");
  if (!roomId) return "skipped: no rooms yet";
  const wsUrl = `${base.replace(/^http/, "ws")}/ws/rooms/${roomId}?token=${token}`;
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => (ws.close(), reject(new Error("no message within 20 s"))), 20_000);
    ws.onmessage = (ev) => {
      clearTimeout(timer);
      ws.close();
      resolve(`connected, first message: ${JSON.parse(ev.data).type}`);
    };
    ws.onerror = () => (clearTimeout(timer), reject(new Error(`could not connect to ${wsUrl.split("?")[0]}`)));
  });
});

console.log(`\nSmoke test: ${base}\n`);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(30)} ${String(r.ms).padStart(6)} ms  ${r.detail ?? ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `${failed} check(s) FAILED` : "All checks passed"}`);
process.exit(failed ? 1 : 0);
