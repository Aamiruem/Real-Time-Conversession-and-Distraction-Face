import Link from "next/link";
import { FEATURES, SITE_NAME } from "@/lib/site";

export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="22" fill="none" stroke="url(#lg)" strokeWidth="6" />
      <circle cx="32" cy="32" r="10" fill="url(#lg)" />
    </svg>
  );
}

export function SiteHeader() {
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
