import { useId } from "react";
import Link from "@/components/Link";
import { DESCRIPTION, FEATURES, OWNER, SITE_NAME } from "@/lib/site";
import { InstallButton } from "@/lib/pwa";
import { BrandIcon } from "./BrandIcons";
import { Icon } from "./Icons";
import { ShareButton } from "./Share";
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

export function SiteFooter() {
  const year = new Date().getFullYear();
  const contacts = [
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

  return (
    <footer className="footer">
      <div className="container footer-grid">
        <section className="footer-brand" aria-label={SITE_NAME}>
          <Link className="brand" href="/">
            <Logo /> {SITE_NAME}
          </Link>
          <p>{DESCRIPTION.split(":")[0]} — private, no sign-up, runs in the browser on any phone or computer.</p>
          <div className="footer-actions">
            <Link className="btn sm" href="/app">
              Open app
            </Link>
            <ShareButton align="left" />
            <InstallButton />
          </div>
        </section>

        <nav aria-label="Features">
          <h3>Features</h3>
          {FEATURES.map((f) => (
            <Link key={f.slug} href={`/features/${f.slug}`}>
              {f.metaTitle.split(" – ")[0]}
            </Link>
          ))}
        </nav>

        <nav aria-label="Product">
          <h3>Product</h3>
          <Link href="/app">Open the app</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Create account</Link>
        </nav>

        <section aria-label="Contact the developer">
          <h3>Built by</h3>
          <p className="footer-owner">
            <b>{OWNER.name}</b>
            <span>{OWNER.role}</span>
          </p>
          <div className="contact-list">
            {contacts.map((c) => (
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
        </section>
      </div>
      <div className="container footer-bottom">
        <span>
          © {year} {SITE_NAME}. All rights reserved.
        </span>
        <span>
          Made by{" "}
          <a href={OWNER.portfolio} target="_blank" rel="noopener noreferrer">
            {OWNER.name}
          </a>
        </span>
      </div>
    </footer>
  );
}
