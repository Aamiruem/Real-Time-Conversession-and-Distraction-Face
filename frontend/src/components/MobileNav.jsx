import { useEffect } from "react";
import Link from "@/components/Link";
import { InstallButton } from "@/lib/pwa";
import { NAV_GROUPS, SECTIONS } from "@/lib/sections";
import { Icon } from "./Icons";
import { ShareButton } from "./Share";
import { Logo } from "./SiteChrome";

// Phones and small tablets: a bottom tab bar like a native app, and a ☰ menu sheet with every section and action
// (the desktop sidebar and the top bar's buttons don't fit there). Shown by CSS below 960 px.

const TABS = ["/app", "/app/focus", "/app/presence", "/app/meet"];
const TAB_LABEL = { "/app": "Home", "/app/focus": "Focus", "/app/presence": "Presence", "/app/meet": "Meet" };

export function MobileTabs({ path, onMenu, menuOpen }) {
  return (
    <nav className="mtabs" aria-label="Main">
      {TABS.map((href) => {
        const sec = SECTIONS[href];
        const on = path === href;
        return (
          <Link key={href} href={href} className={`mtab ${on ? "on" : ""} ${href === "/app/presence" ? "feature" : ""}`}
            style={{ "--c": sec.color }} aria-current={on ? "page" : undefined}>
            <span className="mtab-ico"><Icon name={sec.icon} size={21} /></span>
            <span>{TAB_LABEL[href]}</span>
          </Link>
        );
      })}
      <button type="button" className={`mtab ${menuOpen ? "on" : ""}`} onClick={onMenu} aria-expanded={menuOpen} aria-label="Open menu">
        <span className="mtab-ico"><MenuIcon /></span>
        <span>Menu</span>
      </button>
    </nav>
  );
}

export function MenuIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function MobileMenu({ open, onClose, path, user, theme, onTheme, onCoach, onSearch, onLogout }) {
  // Esc closes; the page behind doesn't scroll while the menu is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const name = user?.full_name || user?.username || "Guest";

  return (
    <div className="mmenu-backdrop" onClick={onClose}>
      <aside className="mmenu" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <header className="mmenu-head">
          <Link href="/" className="brand" onClick={onClose}>
            <Logo size={34} /> Presence AI
          </Link>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close menu">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="mmenu-user">
          <span className="avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
          <span>
            <b>{name}</b>
            <small>{user?.username?.startsWith("guest-") ? "Guest — create an account in Settings to keep your data" : user?.email}</small>
          </span>
        </div>

        <div className="mmenu-actions">
          <button type="button" onClick={() => { onClose(); onCoach(); }}><Icon name="sparkles" size={20} /> AI Coach</button>
          <button type="button" onClick={() => { onClose(); onSearch(); }}><Icon name="search" size={20} /> Search</button>
          <button type="button" onClick={onTheme}><Icon name={theme === "dark" ? "sun" : "moon"} size={20} /> {theme === "dark" ? "Light" : "Dark"}</button>
          <ShareButton label="Share" className="mmenu-share" align="left" />
        </div>
        <InstallButton className="btn block mmenu-install" label="Install the app on this phone" />

        <nav aria-label="All sections">
          {NAV_GROUPS.map(([group, hrefs]) => (
            <section key={group} className="mmenu-group">
              <h3>{group}</h3>
              {hrefs.map((href) => {
                const sec = SECTIONS[href];
                return (
                  <Link key={href} href={href} onClick={onClose} className={`mmenu-link ${path === href ? "on" : ""}`} style={{ "--c": sec.color }}
                    aria-current={path === href ? "page" : undefined}>
                    <span className="nav-ico"><Icon name={sec.icon} size={18} /></span>
                    <span>
                      <b>{sec.label}</b>
                      <small>{sec.desc}</small>
                    </span>
                  </Link>
                );
              })}
            </section>
          ))}
          <section className="mmenu-group">
            <h3>Account</h3>
            <Link href="/app/settings" onClick={onClose} className="mmenu-link" style={{ "--c": SECTIONS["/app/settings"].color }}>
              <span className="nav-ico"><Icon name="settings" size={18} /></span>
              <span><b>Account settings</b><small>Profile, password and data</small></span>
            </Link>
            <Link href="/" onClick={onClose} className="mmenu-link" style={{ "--c": "#2563eb" }}>
              <span className="nav-ico"><Icon name="globe" size={18} /></span>
              <span><b>Presence AI website</b><small>Features, FAQ and how it works</small></span>
            </Link>
            <button type="button" className="mmenu-link" style={{ "--c": "#dc2626" }} onClick={() => { onClose(); onLogout(); }}>
              <span className="nav-ico"><Icon name="back" size={18} /></span>
              <span><b>Sign out</b><small>You stay signed out on this device</small></span>
            </button>
          </section>
        </nav>
      </aside>
    </div>
  );
}
