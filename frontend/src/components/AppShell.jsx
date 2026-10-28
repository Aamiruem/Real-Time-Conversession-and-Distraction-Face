import Link from "@/components/Link";
import { usePathname, useRouter } from "@/lib/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useBackendStatus } from "@/lib/backend";
import { themeLabel, useTheme } from "@/lib/theme";
import { BackendNotice } from "./BackendNotice";
import { CoachPanel, openCoach } from "./CoachPanel";
import { CommandPalette } from "./CommandPalette";
import { Logo } from "./SiteChrome";

// Grouped navigation; each page has its own colour so it is easy to find again (sidebar tile + top bar).
const NAV = [
  ["Home", [["/app", "🏠", "Dashboard", "#38bdf8", "Your progress at a glance"]]],
  [
    "Practice",
    [
      ["/app/focus", "🎥", "Focus Monitor", "#22c55e", "Live focus, distraction and drowsiness"],
      ["/app/speech", "🗣️", "Speech Coach", "#a78bfa", "Confidence, pace and pronunciation"],
      ["/app/conversation", "🗨️", "Conversation Coach", "#f472b6", "Fluency, tone and interaction"],
      ["/app/interview", "💼", "Interview Prep", "#f59e0b", "Mock interviews, any field"],
    ],
  ],
  ["Community", [["/app/rooms", "💬", "Focus Rooms", "#2dd4bf", "Chat with live focus"]]],
  [
    "Insights",
    [
      ["/app/analytics", "📊", "Analytics", "#60a5fa", "History, trends and leaderboard"],
      ["/app/lab", "🧪", "AI Lab", "#c084fc", "Try each AI model on its own"],
    ],
  ],
];
const PAGES = [...NAV.flatMap(([, items]) => items), ["/app/settings", "⚙️", "Account settings", "#94a3b8", "Profile, password and data"]];

const STATUS = {
  ok: ["ok", "Live"],
  outdated: ["warn", "Old backend"],
  offline: ["bad", "Offline"],
  checking: ["", "Connecting…"],
};

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const name = user.full_name || user.username;
  return (
    <div className="user-menu" ref={ref}>
      <button className="avatar" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        {name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <b>{name}</b>
            <span className="small muted">@{user.username}</span>
            <span className="small muted" style={{ wordBreak: "break-all" }}>
              {user.email}
            </span>
          </div>
          <Link href="/app/settings" role="menuitem" onClick={() => setOpen(false)}>
            ⚙️ Account settings
          </Link>
          <Link href="/app/analytics" role="menuitem" onClick={() => setOpen(false)}>
            📊 My progress
          </Link>
          <Link href="/" role="menuitem" onClick={() => setOpen(false)}>
            🌐 Website
          </Link>
          <button role="menuitem" onClick={onLogout}>
            🚪 Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }) {
  const { user, ready, offline, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const backend = useBackendStatus();
  const { theme, toggle } = useTheme();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    if (ready && !user && !offline) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, user, offline, path, router]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const logout = () => {
    signOut();
    router.replace("/login");
  };

  if (ready && !user && offline) {
    // saved login, backend unreachable: wait here (auth retries every 5 s) instead of bouncing to the login page
    return (
      <main className="offline-wait">
        <Link href="/" className="brand">
          <Logo /> Presence AI
        </Link>
        <BackendNotice />
        <p className="muted small">You're still signed in — your dashboard opens by itself as soon as the backend answers.</p>
      </main>
    );
  }

  if (!ready || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <span className="spinner" />
      </div>
    );
  }

  const page = PAGES.find(([href]) => href === path) ?? PAGES[0];
  const [tone, label] = STATUS[backend.status] ?? STATUS.checking;

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/app" className="brand" style={{ padding: "4px 10px 16px" }}>
          <Logo /> Presence AI
        </Link>
        <nav className="side-nav" aria-label="App">
          {NAV.map(([group, items]) => (
            <div key={group} className="nav-group">
              <div className="nav-label">{group}</div>
              {items.map(([href, icon, text, color]) => (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item ${path === href ? "on" : ""}`}
                  style={{ "--c": color }}
                  aria-current={path === href ? "page" : undefined}
                >
                  <span className="nav-ico">{icon}</span>
                  {text}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-spacer" />
        <p className="side-foot small muted">Video never leaves your device.</p>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title" style={{ "--c": page[3] }}>
            <span className="nav-ico">{page[1]}</span>
            <div>
              <b>{page[2]}</b>
              <span className="small muted">{page[4]}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className={`status-pill ${tone}`} title="Backend status (re-checked automatically)">
              <span className="dot" /> {label}
            </span>
            <button className="coach-btn" onClick={() => openCoach()} aria-label="Open the AI coach">
              ✨ <span>Coach</span>
            </button>
            <button className="topbar-search" onClick={() => setPalette(true)} aria-label="Search pages and actions">
              🔎 <span>Search…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button className="icon-btn" onClick={toggle} aria-label={themeLabel(theme)} title={themeLabel(theme)}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <UserMenu user={user} onLogout={logout} />
          </div>
        </header>
        <main className="main">
          <BackendNotice />
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} onLogout={logout} />
      <CoachPanel />
    </div>
  );
}
