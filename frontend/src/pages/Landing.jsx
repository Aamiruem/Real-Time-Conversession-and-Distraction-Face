import Link from "@/components/Link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { DESCRIPTION, FEATURES, HOME_FAQ, jsonLd, OWNER, SITE_NAME, SITE_URL, TOPICS } from "@/lib/site";
import { TopicThumb } from "@/components/CameraPoster";
import { Icon } from "@/components/Icons";

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
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icon-512.png`,
      sameAs: [OWNER.github && `${OWNER.github}/Real-Time-Conversession-and-Distraction-Face`].filter(Boolean),
      founder: {
        "@type": "Person",
        name: OWNER.name,
        jobTitle: OWNER.role,
        url: OWNER.portfolio,
        sameAs: [OWNER.linkedin, OWNER.github, OWNER.portfolio].filter(Boolean),
      },
    },
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

// Every card on the home page: the feature pages first, then the sections that have no page of their own.
const CARDS = [
  ...FEATURES.map((f) => ({ title: f.label, text: f.tagline, topic: TOPICS[f.slug], more: `/features/${f.slug}` })),
  {
    title: "Focus Rooms",
    text: "Chat and work alongside others, with everyone's live focus score.",
    topic: { kind: "rooms", icon: "users", color: "#0d9488", app: "/app/rooms" },
  },
  {
    title: "Analytics",
    text: "Your focus history, speaking progress and leaderboard in one place.",
    topic: { kind: "analytics", icon: "chart", color: "#0284c7", app: "/app/analytics" },
  },
  {
    title: "Secure Accounts",
    text: "Hashed passwords, with optional email and mobile OTP verification.",
    topic: { kind: "secure", icon: "lock", color: "#4f46e5", app: "/signup", go: "Create account" },
  },
];

const STATS = [
  ["478", "face landmarks per frame"],
  ["7", "speaking-confidence signals"],
  ["3", "fatigue risk levels"],
  ["0", "videos uploaded"],
];

const STEPS = [
  ["Open the app", "No sign-up needed. Start as a guest, or create a free account to keep your history."],
  ["Turn on your camera", "Start a focus session or a speaking exercise. Analysis runs live."],
  ["Get feedback", "See your focus %, fatigue risk, speaking confidence and concrete tips."],
  ["Improve over time", "Track progress in analytics. The AI personalises as you give feedback."],
];

const TECH = [
  ["Computer vision", "MediaPipe Face Landmarker in the browser (WebAssembly + GPU)"],
  ["Natural language processing", "VADER / Amazon Comprehend sentiment, keywords, summaries"],
  ["Speech AI", "faster-whisper speech-to-text, pitch & loudness analysis"],
  ["Machine learning", "scikit-learn model selection, cross-validation, model card"],
  ["Backend & real time", "FastAPI, WebSockets, JWT, SQLAlchemy"],
  ["Cloud", "AWS RDS, S3, SES email, SNS SMS, Comprehend, EC2 + Docker"],
];

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      <SiteHeader />
      <main className="container">
        <section className="hero">
          <p className="eyebrow">Free · Private · No sign-up</p>
          <h1>
            Stay focused. <span className="grad">Speak with confidence.</span>
          </h1>
          <p className="lead">
            {SITE_NAME} spots distraction through your webcam, coaches your speaking voice and predicts fatigue before
            it hits.
          </p>
          <div className="cta">
            {/* the app signs you in as a guest by itself (and reuses this device's login) */}
            <Link className="btn" href="/app">
              Open the app — no login
            </Link>
            <Link className="btn ghost" href="#how">
              See how it works
            </Link>
          </div>
          <ul className="stats">
            {STATS.map(([v, l]) => (
              <li key={l} className="stat">
                <b>{v}</b>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="features" className="section">
          <h2>Everything you need to focus and communicate better</h2>
          <div className="grid g4 home-cards">
            {CARDS.map((c) => (
              <article key={c.title} className="card home-card" style={{ "--pc": c.topic.color }}>
                {/* wide screens show the illustration; small screens a compact icon row */}
                <TopicThumb kind={c.topic.kind} color={c.topic.color} label={c.title} />
                <span className="home-card-ico" aria-hidden="true">
                  <Icon name={c.topic.icon} size={21} />
                </span>
                <div className="home-card-text">
                  <h3>
                    <Link className="home-card-link" href={c.topic.app}>
                      {c.title}
                    </Link>
                  </h3>
                  <p>{c.text}</p>
                </div>
                <div className="home-card-actions">
                  <span className="home-card-go" aria-hidden="true">{c.topic.go ?? "Open"} →</span>
                  {c.more && (
                    <Link className="feature-more" href={c.more}>
                      Learn more<span className="sr-only"> about {c.title}</span>
                    </Link>
                  )}
                </div>
                <span className="home-card-chev" aria-hidden="true">
                  <Icon name="forward" size={18} />
                </span>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="section">
          <h2>How it works</h2>
          <ol className="grid g4 steps">
            {STEPS.map(([h, p]) => (
              <li key={h} className="card">
                <h3>{h}</h3>
                <p>{p}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="tech" className="section">
          <h2>Built on a complete AI/ML stack</h2>
          <dl className="card tech-list">
            {TECH.map(([h, p]) => (
              <div key={h}>
                <dt>{h}</dt>
                <dd>{p}</dd>
              </div>
            ))}
          </dl>
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
      </main>
      <SiteFooter />
    </>
  );
}
