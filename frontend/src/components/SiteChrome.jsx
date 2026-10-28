import { useId } from "react";
import Link from "@/components/Link";
import { FEATURES, SITE_NAME } from "@/lib/site";
import { themeLabel, useTheme } from "@/lib/theme";

/** Presence AI mark: a focus ring with an attention dot (being present) and two voice waves (having presence). */
export function Logo({ size = 30 }) {
  const id = useId(); // unique gradient id: several logos can be on one page
  const paint = `url(#${id})`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="25" cy="32" r="13" fill="none" stroke={paint} strokeWidth="5.5" />
      <circle cx="25" cy="32" r="5" fill={paint} />
      <path d="M43 23.5a12 12 0 0 1 0 17" fill="none" stroke={paint} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M50 17a21 21 0 0 1 0 30" fill="none" stroke={paint} strokeWidth="4.5" strokeLinecap="round" opacity=".65" />
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
