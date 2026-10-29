import Link from "@/components/Link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { DESCRIPTION, FEATURES, HOME_FAQ, jsonLd, SITE_NAME, SITE_URL } from "@/lib/site";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/navigation";

/** One click into the app with a guest account (kept tiny: this page is the SEO landing page). */
function TryAsGuest() {
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();
  const go = async () => {
    setBusy(true);
    try {
      signIn(await api("/auth/guest", { method: "POST" }));
      router.push("/app"); // no page reload: straight into the app
    } catch {
      router.push("/login"); // guests turned off or backend offline: the normal sign-in page
    }
  };
  return (
    <button className="btn ghost" onClick={go} disabled={busy}>
      {busy ? "Starting…" : "👤 Try it now — no sign-up"}
    </button>
  );
}

// Pre-rendered to static HTML at build time (scripts/prerender.mjs), so crawlers get complete HTML instantly.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web browser",
      description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: FEATURES.map((f) => f.title),
    },
    { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/`, logo: `${SITE_URL}/icon.svg` },
    { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
    {
      "@type": "FAQPage",
      mainEntity: HOME_FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

const EXTRA = [
  {
    icon: "💬",
    title: "Focus rooms",
    text: "Real-time chat where everyone sees each other's live focus score, with sentiment and confidence analysis.",
  },
  {
    icon: "📊",
    title: "Analytics",
    text: "Focus history, speaking progress, leaderboard and conversation insights in one dashboard.",
  },
  {
    icon: "🔐",
    title: "Secure accounts",
    text: "Bcrypt-hashed passwords, optional email + mobile OTP verification, data on AWS RDS and S3.",
  },
];

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      <SiteHeader />
      <main className="container">
        <section className="hero">
          <p className="eyebrow">Computer vision · NLP · Speech AI · Machine learning</p>
          <h1>
            Stay focused. <span className="grad">Speak with confidence.</span>
          </h1>
          <p className="lead">
            {SITE_NAME} detects distraction and drowsiness through your webcam, coaches your speaking voice, predicts
            fatigue before it hits and lets you work alongside others in focus-aware rooms.
          </p>
          <div className="cta">
            <Link className="btn" href="/signup">
              Start free — create account
            </Link>
            <TryAsGuest />
            <Link className="btn ghost" href="#how">
              See how it works
            </Link>
          </div>
          <ul className="stats" style={{ listStyle: "none", padding: 0 }}>
            {[
              ["478", "face landmarks per frame"],
              ["7", "speaking-confidence signals"],
              ["3", "fatigue risk levels"],
              ["0", "videos uploaded"],
            ].map(([v, l]) => (
              <li key={l} className="metric">
                <div className="v">{v}</div>
                <div className="l">{l}</div>
              </li>
            ))}
          </ul>
        </section>

        <section id="features" className="section">
          <h2>Everything you need to focus and communicate better</h2>
          <div className="grid g3">
            {FEATURES.map((f) => (
              <Link key={f.slug} href={`/features/${f.slug}`} className="card feature-card">
                <div className="ic">{f.icon}</div>
                <h3>{f.metaTitle.split(" – ")[0]}</h3>
                <p>{f.summary}</p>
                <p style={{ marginTop: 10, color: "var(--accent)", fontWeight: 600 }}>Learn more →</p>
              </Link>
            ))}
            {EXTRA.map((f) => (
              <article key={f.title} className="card">
                <div className="ic">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="section">
          <h2>How it works</h2>
          <ol className="grid g4 steps">
            {[
              ["Create your account", "Sign up with your email in seconds."],
              ["Turn on your camera", "Start a focus session or a speaking exercise — analysis runs live."],
              ["Get feedback", "See focus %, fatigue risk, speaking confidence and concrete tips instantly."],
              ["Improve over time", "Track progress in analytics; the AI personalises as you give feedback."],
            ].map(([h, p]) => (
              <li key={h} className="card">
                <h3>{h}</h3>
                <p>{p}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="tech" className="section">
          <h2>Built on a complete AI/ML stack</h2>
          <div className="grid g3">
            {[
              ["Computer vision", "MediaPipe Face Landmarker in the browser (WebAssembly + GPU)"],
              ["Natural language processing", "VADER / Amazon Comprehend sentiment, keywords, summaries"],
              ["Speech AI", "faster-whisper speech-to-text, pitch & loudness analysis"],
              ["Machine learning", "scikit-learn model selection, cross-validation, model card"],
              ["Backend & real time", "FastAPI, WebSockets, JWT, SQLAlchemy"],
              ["Cloud", "AWS RDS, S3, SES email, SNS SMS, Comprehend, EC2 + Docker"],
            ].map(([h, p]) => (
              <div key={h} className="card">
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="section">
          <h2>Frequently asked questions</h2>
          {HOME_FAQ.map((f) => (
            <details key={f.q} className="faq">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section className="section" style={{ textAlign: "center" }}>
          <h2>Ready to focus better?</h2>
          <Link className="btn" href="/signup">
            Create your free account
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
