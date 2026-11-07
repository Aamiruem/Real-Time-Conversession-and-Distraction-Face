import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/Link";
import { FEATURES, OWNER, SITE_NAME, TOPICS } from "@/lib/site";
import { InstallButton } from "@/lib/pwa";
import { BrandIcon } from "./BrandIcons";
import { Icon } from "./Icons";
import { ShareButton } from "./Share";
import { NAV_GROUPS, SECTIONS } from "@/lib/sections";
import { usePathname } from "@/lib/navigation";
import { themeLabel, useTheme } from "@/lib/theme";

/** Presence AI mark: a focus ring with an attention dot (being present) and two voice waves (having presence). */
/** App icon: a rounded tile in the brand gradient with a white "presence" mark (an eye-like dot sending signal waves). */
export function Logo({ size = 30 }) {
  const id = useId(); // unique gradient id: several logos can be on one page
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0ea5e9" />
          <stop offset=".55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="2" />
      <circle cx="25" cy="32" r="11" fill="none" stroke="#fff" strokeWidth="5" />
      <circle cx="25" cy="32" r="4.2" fill="#fff" />
      <path d="M41.5 24.5a11 11 0 0 1 0 15" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M48.5 18.5a20 20 0 0 1 0 27" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}

export function SiteHeader() {
  const { theme, toggle } = useTheme();
  const [menu, setMenu] = useState(false);
  return (
    <header className="nav">
      <div className="container">
        <Link className="brand" href="/" aria-label={`${SITE_NAME} home`}>
          <Logo /> {SITE_NAME}
        </Link>
        <nav aria-label="Main">
          <Link href="/#features" className="wide-only">Features</Link>
          <Link href="/#how" className="wide-only">How it works</Link>
          <Link href="/#faq" className="wide-only">FAQ</Link>
          <span className="wide-only">
            <ShareButton className="btn ghost sm compact" />
          </span>
          <span className="wide-only">
            <InstallButton className="btn ghost sm compact" />
          </span>
          <button className="icon-btn wide-only" onClick={toggle} aria-label={themeLabel(theme)} title={themeLabel(theme)}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
          <Link href="/login" className="wide-only">Sign in</Link>
          {/* the app signs visitors in as a guest by itself: no form needed to start */}
          <Link className="btn sm nav-open" href="/app" aria-label="Open app">
            <Icon name="dashboard" size={16} /> <span>Open app</span>
          </Link>
          <button type="button" className="icon-btn site-menu-btn" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </nav>
      </div>
      <SiteMenu open={menu} onClose={() => setMenu(false)} theme={theme} onTheme={toggle} />
    </header>
  );
}

/** Small screens: everything the header and footer offer, in one menu sheet (same look as the app's menu). */
function SiteMenu({ open, onClose, theme, onTheme }) {
  const path = usePathname();
  useEffect(() => onClose(), [path]); // a link was followed
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  // drawn on <body>: the header's blur effect would otherwise trap a fixed-position sheet inside the 64px header
  return createPortal(<SiteMenuSheet onClose={onClose} theme={theme} onTheme={onTheme} />, document.body);
}

function SiteMenuSheet({ onClose, theme, onTheme }) {
  const item = (href, icon, color, label, external = false) => (
    <Link key={href} href={href} onClick={onClose} className="mmenu-link" style={{ "--c": color }}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <span className="nav-ico"><Icon name={icon} size={18} /></span>
      <b>{label}</b>
    </Link>
  );
  const fold = (title, children) => (
    <details className="mmenu-fold">
      <summary>
        {title} <Icon name="forward" size={16} />
      </summary>
      <div>{children}</div>
    </details>
  );

  return (
    <div className="mmenu-backdrop" onClick={onClose}>
      <aside className="mmenu right" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <header className="mmenu-head">
          <Link href="/" className="brand" onClick={onClose}>
            <Logo size={34} /> {SITE_NAME}
          </Link>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close menu">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="site-menu-cta">
          <Link className="btn block" href="/app" onClick={onClose}>Open the app — no login</Link>
          <div className="site-menu-auth">
            <Link className="btn ghost" href="/signup" onClick={onClose}>Create account</Link>
            <Link className="btn ghost" href="/login" onClick={onClose}>Sign in</Link>
          </div>
        </div>

        <div className="mmenu-actions two">
          <ShareButton label="Share" className="mmenu-share" align="left" />
          <button type="button" onClick={onTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={20} /> {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
        <InstallButton className="btn block mmenu-install" label="Install the app on this device" />

        {/* the three main links stay open; the longer lists fold away so the whole menu fits on one screen */}
        <nav aria-label="Site" className="mmenu-nav">
          {item("/#features", "sparkles", "#2563eb", "Features")}
          {item("/#how", "compass", "#0d9488", "How it works")}
          {item("/#faq", "bulb", "#d97706", "FAQ")}
          {fold("Feature guides", FEATURES.map((f) => item(`/features/${f.slug}`, TOPICS[f.slug].icon, TOPICS[f.slug].color, f.label)))}
          {fold("App sections", NAV_GROUPS.flatMap(([, hrefs]) => hrefs).map((href) =>
            item(href, SECTIONS[href].icon, SECTIONS[href].color, SECTIONS[href].label)))}
          {fold(`Built by ${OWNER.name}`, [
            OWNER.portfolio && item(OWNER.portfolio, "globe", "#6366f1", "Portfolio", true),
            OWNER.linkedin && item(OWNER.linkedin, "users", "#0a66c2", "LinkedIn", true),
            OWNER.github && item(OWNER.github, "code", "#6e5494", "GitHub", true),
          ])}
        </nav>
      </aside>
    </div>
  );
}

/** WhatsApp wants the number as digits only (country code first, no +). */
const waNumber = (phone) => phone.replace(/\D/g, "");

const BADGES = ["Free", "No login", "Private", "Any device"];

/** Round social / contact buttons for the footer (each one only when its detail is filled in). */
function SocialLinks() {
  const links = [
    OWNER.portfolio && { href: OWNER.portfolio, label: "Portfolio", icon: <Icon name="globe" size={18} />, brand: "#6366f1" },
    OWNER.linkedin && { href: OWNER.linkedin, label: "LinkedIn", icon: <BrandIcon name="linkedin" size={17} />, brand: "#0a66c2" },
    OWNER.github && { href: OWNER.github, label: "GitHub", icon: <BrandIcon name="github" size={18} />, brand: "#6e5494" },
    OWNER.phone && {
      href: `https://wa.me/${waNumber(OWNER.phone)}?text=${encodeURIComponent(`Hi ${OWNER.name.split(" ")[0]}, I found ${SITE_NAME} and `)}`,
      label: "WhatsApp",
      icon: <BrandIcon name="whatsapp" size={18} />,
      brand: "#25d366",
    },
    OWNER.phone && { href: `tel:${OWNER.phone}`, label: "Call", icon: <Icon name="phone" size={17} />, brand: "#16a34a", same: true },
    OWNER.email && { href: `mailto:${OWNER.email}`, label: "Email", icon: <Icon name="mail" size={18} />, brand: "#ea4335", same: true },
  ].filter(Boolean);
  return (
    <div className="social-row">
      {links.map((l) => (
        <a
          key={l.label}
          className="social-btn"
          href={l.href}
          style={{ "--brand": l.brand }}
          title={l.label}
          aria-label={`${OWNER.name} on ${l.label}`}
          {...(l.same ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        >
          {l.icon}
        </a>
      ))}
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <footer className="footer">
      <div className="container">
        <section className="footer-cta" aria-label="Get started">
          <div>
            <h2>
              Stay focused. <span>Speak with confidence.</span>
            </h2>
            <p>Open {SITE_NAME} on any phone or computer — free, private, no sign-up.</p>
          </div>
          <div className="footer-cta-actions">
            <Link className="btn footer-cta-main" href="/app">
              Open the app →
            </Link>
            <ShareButton className="btn ghost footer-cta-ghost" align="left" />
            <InstallButton className="btn ghost footer-cta-ghost" />
          </div>
        </section>
      </div>

      <div className="container footer-grid">
        <section className="footer-brand" aria-label={SITE_NAME}>
          <Link className="brand" href="/">
            <Logo /> {SITE_NAME}
          </Link>
          <p>Free AI focus tracker and interview coach — focus tracking, speech and interview coaching, right in your browser.</p>
          <ul className="footer-badges" aria-label="Highlights">
            {BADGES.map((b) => (
              <li key={b}>
                <Icon name="check" size={13} /> {b}
              </li>
            ))}
          </ul>
        </section>

        <nav aria-label="Features">
          <h3>Features</h3>
          {FEATURES.map((f) => (
            <Link key={f.slug} href={`/features/${f.slug}`} className="footer-feature" style={{ "--dot": TOPICS[f.slug]?.color }}>
              {f.label}
            </Link>
          ))}
        </nav>

        <nav aria-label="Product">
          <h3>Product</h3>
          <Link href="/app">Open the app</Link>
          <Link href="/app/meet">Video meetings</Link>
          <Link href="/app/rooms">Focus rooms</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/signup">Create account</Link>
        </nav>

        <section aria-label="Contact the developer">
          <h3>Built by</h3>
          <div className="footer-owner">
            <span className="owner-avatar" aria-hidden="true">
              {OWNER.name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <b>{OWNER.name}</b>
              <span>{OWNER.role}</span>
            </div>
          </div>
          <SocialLinks />
          <a className="footer-portfolio" href={OWNER.portfolio} target="_blank" rel="noopener noreferrer">
            View portfolio <Icon name="external" size={14} />
          </a>
        </section>
      </div>

      <div className="footer-bottom">
        <div className="container">
          <span>
            © {year} {SITE_NAME}. All rights reserved.
          </span>
          <span>
            Made with <span className="heart" aria-label="love">♥</span> in India by{" "}
            <a href={OWNER.portfolio} target="_blank" rel="noopener noreferrer">
              {OWNER.name}
            </a>
          </span>
          <button type="button" className="to-top" onClick={toTop} aria-label="Back to top">
            ↑ Top
          </button>
        </div>
      </div>
    </footer>
  );
}

/** "Related to this page": where people usually go next from each section. */
const RELATED = {
  "/app": ["/app/focus", "/app/speech", "/app/interview"],
  "/app/routine": ["/app/focus", "/app/analytics", "/app/speech"],
  "/app/focus": ["/app/analytics", "/app/rooms", "/app/routine"],
  "/app/speech": ["/app/conversation", "/app/interview", "/app/analytics"],
  "/app/conversation": ["/app/speech", "/app/interview", "/app/rooms"],
  "/app/interview": ["/app/presence", "/app/speech", "/app/conversation"],
  "/app/presence": ["/app/interview", "/app/speech", "/app/analytics"],
  "/app/meet": ["/app/rooms", "/app/conversation", "/app/focus"],
  "/app/rooms": ["/app/meet", "/app/focus", "/app/analytics"],
  "/app/analytics": ["/app/focus", "/app/speech", "/app/routine"],
  "/app/vision": ["/app/lab", "/app/focus", "/app/interview"],
  "/app/lab": ["/app/vision", "/app/analytics", "/app/focus"],
  "/app/settings": ["/app", "/app/analytics", "/app/routine"],
};

/** Footer under every app page: where to go next, the credit line and back to top. */
export function AppFooter() {
  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const path = usePathname();
  const related = (RELATED[path] ?? RELATED["/app"]).filter((h) => SECTIONS[h]);
  return (
    <footer className="app-footer">
      <section className="af-related" aria-label="Related to this page">
        <h3>Keep going</h3>
        <div className="af-related-grid">
          {related.map((href) => {
            const sec = SECTIONS[href];
            return (
              <Link key={href} href={href} className="af-card" style={{ "--c": sec.color }}>
                <span className="af-card-ico">
                  <Icon name={sec.icon} size={20} />
                </span>
                <span>
                  <b>{sec.label}</b>
                  <small>{sec.desc}</small>
                </span>
                <span className="af-card-go" aria-hidden="true">→</span>
              </Link>
            );
          })}
        </div>
      </section>
      <div className="af-bottom">
        <span>
          © {new Date().getFullYear()} {SITE_NAME} · Made with <span className="heart">♥</span> by{" "}
          <a href={OWNER.portfolio} target="_blank" rel="noopener noreferrer">
            {OWNER.name}
          </a>
        </span>
        <span className="af-meta">
          <span><Icon name="lock" size={14} /> Video never leaves your device</span>
          <button type="button" className="to-top" onClick={toTop} aria-label="Back to top">
            ↑ Top
          </button>
        </span>
      </div>
    </footer>
  );
}
