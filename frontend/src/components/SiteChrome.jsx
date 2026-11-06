import { useId } from "react";
import Link from "@/components/Link";
import { FEATURES, OWNER, SITE_NAME, TOPICS } from "@/lib/site";
import { InstallButton } from "@/lib/pwa";
import { BrandIcon } from "./BrandIcons";
import { Icon } from "./Icons";
import { ShareButton } from "./Share";
import { SECTIONS } from "@/lib/sections";
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
  return (
    <header className="nav">
      <div className="container">
        <Link className="brand" href="/" aria-label={`${SITE_NAME} home`}>
          <Logo /> {SITE_NAME}
        </Link>
        <nav aria-label="Main">
          <Link href="/#features">Features</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/#faq">FAQ</Link>
          <ShareButton className="btn ghost sm compact" />
          <InstallButton className="btn ghost sm compact" />
          <button className="icon-btn" onClick={toggle} aria-label={themeLabel(theme)} title={themeLabel(theme)}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <Link href="/login">Sign in</Link>
          {/* the app signs visitors in as a guest by itself: no form needed to start */}
          <Link className="btn sm" href="/app">
            Open app
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** WhatsApp wants the number as digits only (country code first, no +). */
const waNumber = (phone) => phone.replace(/\D/g, "");

/** The developer's contact buttons: only those with a detail filled in (OWNER in lib/site.js). */
function ownerContacts() {
  return [
    OWNER.portfolio && { href: OWNER.portfolio, label: "Portfolio", icon: <Icon name="globe" size={17} /> },
    OWNER.linkedin && { href: OWNER.linkedin, label: "LinkedIn", icon: <BrandIcon name="linkedin" size={16} /> },
    OWNER.phone && {
      href: `https://wa.me/${waNumber(OWNER.phone)}?text=${encodeURIComponent(`Hi ${OWNER.name.split(" ")[0]}, I found ${SITE_NAME} and `)}`,
      label: "WhatsApp",
      icon: <BrandIcon name="whatsapp" size={16} />,
    },
    OWNER.phone && { href: `tel:${OWNER.phone}`, label: "Call", icon: <Icon name="phone" size={16} />, same: true },
    OWNER.email && { href: `mailto:${OWNER.email}`, label: "Email", icon: <Icon name="mail" size={16} />, same: true },
  ].filter(Boolean);
}

function ContactList() {
  return (
    <div className="contact-list">
      {ownerContacts().map((c) => (
        <a
          key={c.label}
          className="contact-chip"
          href={c.href}
          {...(c.same ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        >
          {c.icon} {c.label}
        </a>
      ))}
    </div>
  );
}

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
              {f.metaTitle.split(" – ")[0]}
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

/** The sections the app footer links to (colours / icons from lib/sections). */
const APP_LINKS = ["/app", "/app/focus", "/app/speech", "/app/interview", "/app/meet", "/app/analytics"];

/** "Related to this page": where people usually go next from each section. */
const RELATED = {
  "/app": ["/app/focus", "/app/speech", "/app/interview"],
  "/app/routine": ["/app/focus", "/app/analytics", "/app/speech"],
  "/app/focus": ["/app/analytics", "/app/rooms", "/app/routine"],
  "/app/speech": ["/app/conversation", "/app/interview", "/app/analytics"],
  "/app/conversation": ["/app/speech", "/app/interview", "/app/rooms"],
  "/app/interview": ["/app/speech", "/app/conversation", "/app/focus"],
  "/app/meet": ["/app/rooms", "/app/conversation", "/app/focus"],
  "/app/rooms": ["/app/meet", "/app/focus", "/app/analytics"],
  "/app/analytics": ["/app/focus", "/app/speech", "/app/routine"],
  "/app/vision": ["/app/lab", "/app/focus", "/app/interview"],
  "/app/lab": ["/app/vision", "/app/analytics", "/app/focus"],
  "/app/settings": ["/app", "/app/analytics", "/app/routine"],
};

/** Footer under every app page: quick links to the main sections, share, the developer's links, back to top. */
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
      <div className="af-main">
        <Link href="/" className="af-brand" aria-label={`${SITE_NAME} home`}>
          <Logo size={34} />
          <span>
            <b>{SITE_NAME}</b>
            <small>Focus · Speak · Meet — free on any device</small>
          </span>
        </Link>
        <nav className="af-links" aria-label="Sections">
          {APP_LINKS.map((href) => {
            const sec = SECTIONS[href];
            return (
              <Link key={href} href={href} className="af-link" style={{ "--c": sec.color }} title={sec.desc}>
                <Icon name={sec.icon} size={16} /> {href === "/app" ? "Dashboard" : sec.label}
              </Link>
            );
          })}
        </nav>
        <div className="af-actions">
          <ShareButton label="Share app" className="btn sm af-share" align="left" />
          <SocialLinks />
        </div>
      </div>
      <div className="af-bottom">
        <span>
          © {new Date().getFullYear()} {SITE_NAME} · Made with <span className="heart">♥</span> by{" "}
          <a href={OWNER.portfolio} target="_blank" rel="noopener noreferrer">
            {OWNER.name}
          </a>
        </span>
        <span className="af-meta">
          <span>🔒 Video never leaves your device</span>
          <button type="button" className="to-top" onClick={toTop} aria-label="Back to top">
            ↑ Top
          </button>
        </span>
      </div>
    </footer>
  );
}
