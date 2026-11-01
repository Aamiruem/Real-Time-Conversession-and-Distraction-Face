import Link from "@/components/Link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { DESCRIPTION, FEATURES, HOME_FAQ, jsonLd, SITE_NAME, SITE_URL, TOPICS } from "@/lib/site";
import { TopicThumb } from "@/components/CameraPoster";

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
    // name + alternateName: Google shows "Presence AI" as the site name in results and matches "PresenceAI" too
    { "@type": "WebSite", name: SITE_NAME, alternateName: ["PresenceAI", "Presence AI app"], url: `${SITE_URL}/` },
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
    title: "Focus rooms",
    text: "Real-time chat where everyone sees each other's live focus score, with sentiment and confidence analysis.",
    topic: { kind: "rooms", color: "#0d9488", app: "/app/rooms", open: "Join a focus room" },
  },
  {
    title: "Analytics",
    text: "Focus history, speaking progress, leaderboard and conversation insights in one dashboard.",
    topic: { kind: "analytics", color: "#0284c7", app: "/app/analytics", open: "See your analytics" },
  },
  {
    title: "Secure accounts",
    text: "Bcrypt-hashed passwords, optional email + mobile OTP verification, data on AWS RDS and S3.",
    topic: { kind: "secure", color: "#4f46e5", app: "/signup", open: "Create a free account" },
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
            {/* the app signs you in as a guest by itself (and reuses this device's login) */}
            <Link className="btn" href="/app">
              Open the app — no login
            </Link>
            <Link className="btn ghost" href="/signup">
              Create account
            </Link>
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
            {[
              ...FEATURES.map((f) => ({ title: f.metaTitle.split(" – ")[0], text: f.summary, topic: TOPICS[f.slug], more: `/features/${f.slug}` })),
              ...EXTRA,
            ].map((f) => (
              <article key={f.title} className="card feature-card" style={{ "--pc": f.topic.color }}>
                <TopicThumb kind={f.topic.kind} color={f.topic.color} label={f.title} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <div className="feature-actions">
                  <Link className="btn sm topic-btn" href={f.topic.app}>
                    {f.topic.open} →
                  </Link>
                  {f.more && (
                    <Link className="feature-more" href={f.more}>
                      Learn more
                    </Link>
                  )}
                </div>
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
