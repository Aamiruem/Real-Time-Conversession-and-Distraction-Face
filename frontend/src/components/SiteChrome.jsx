import { useId } from "react";
import Link from "@/components/Link";
import { FEATURES, SITE_NAME } from "@/lib/site";
import { InstallButton } from "@/lib/pwa";
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
          <InstallButton />
          <button className="icon-btn" onClick={toggle} aria-label={themeLabel(theme)} title={themeLabel(theme)}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <Link href="/login">Sign in</Link>
          <Link className="btn sm" href="/signup">
            Get started free
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <span>
          © {new Date().getFullYear()} {SITE_NAME}
        </span>
        <nav aria-label="Footer" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {FEATURES.map((f) => (
            <Link key={f.slug} href={`/features/${f.slug}`}>
              {f.metaTitle.split(" – ")[0]}
            </Link>
          ))}
          <Link href="/signup">Sign up</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
