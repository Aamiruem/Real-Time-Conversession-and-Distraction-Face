import Link from "@/components/Link";
import { usePathname, useRouter, useSearchParams } from "@/lib/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useBackendStatus } from "@/lib/backend";
import { themeLabel, useTheme } from "@/lib/theme";
import { BackendNotice } from "./BackendNotice";
import { CoachPanel, openCoach } from "./CoachPanel";
import { CommandPalette } from "./CommandPalette";
import { Logo } from "./SiteChrome";
import { InstallButton } from "@/lib/pwa";
import { NAV_GROUPS, SECTIONS } from "@/lib/sections";
import { Icon } from "./Icons";

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

  const query = useSearchParams().toString();
  useEffect(() => {
    // an old invite link (/app/meet?code=…): meetings now live at their own link, /<code>, which guests can open too
    const code = path === "/app/meet" && new URLSearchParams(query).get("code");
    if (code && /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code)) return router.replace(`/${code}`);
    // keep the query too, so links into the app still open the right page after signing in
    if (ready && !user && !offline) router.replace(`/login?next=${encodeURIComponent(path + (query ? `?${query}` : ""))}`);
  }, [ready, user, offline, path, query, router]);

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

  const page = SECTIONS[path] ?? SECTIONS["/app"];
  const [tone, label] = STATUS[backend.status] ?? STATUS.checking;

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/app" className="brand side-brand" aria-label="Presence AI — dashboard">
          <Logo size={38} />
          <span className="brand-text">
            <span className="brand-name">
              Presence <span className="brand-ai">AI</span>
            </span>
            <span className="brand-tag">Focus · Speak · Meet</span>
          </span>
        </Link>
        <nav className="side-nav" aria-label="App">
          {NAV_GROUPS.map(([group, hrefs]) => (
            <div key={group} className="nav-group">
              <div className="nav-label">{group}</div>
              {hrefs.map((href) => {
                const sec = SECTIONS[href];
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`nav-item ${path === href ? "on" : ""}`}
                    style={{ "--c": sec.color }}
                    aria-current={path === href ? "page" : undefined}
                  >
                    <span className="nav-ico">
                      <Icon name={sec.icon} size={17} />
                    </span>
                    {sec.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="side-spacer" />
        <p className="side-foot small muted">🔒 Video never leaves your device.</p>
      </aside>

      <div className="workspace">
        <header className="topbar" style={{ "--c": page.color }}>
          <div className="topbar-title">
            <span className="nav-ico lg">
              <Icon name={page.icon} size={21} />
            </span>
            <div>
              <b>{page.label}</b>
              <span className="small muted">{page.desc}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className={`status-pill ${tone}`} title="Backend status (re-checked automatically)">
              <span className="dot" /> {label}
            </span>
            <button className="coach-btn" onClick={() => openCoach()} aria-label="Open the AI coach">
              <Icon name="sparkles" size={17} /> <span>Coach</span>
            </button>
            <button className="topbar-search" onClick={() => setPalette(true)} aria-label="Search pages and actions">
              <Icon name="search" size={16} /> <span>Search…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <InstallButton />
            <button className="icon-btn" onClick={toggle} aria-label={themeLabel(theme)} title={themeLabel(theme)}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
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
