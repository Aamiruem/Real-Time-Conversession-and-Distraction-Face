import Link from "@/components/Link";
import { useParams } from "react-router";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { FEATURES, jsonLd, SITE_NAME, SITE_URL } from "@/lib/site";
import NotFound from "./NotFound";

// Page text and SEO tags (lib/seo.js) come from FEATURES in lib/site.js; every slug is pre-rendered at build time.
export default function FeaturePage() {
  const { slug } = useParams();
  const f = FEATURES.find((x) => x.slug === slug);
  if (!f) return <NotFound />;
  const url = `${SITE_URL}/features/${f.slug}`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: f.metaTitle, item: url },
        ],
      },
      { "@type": "WebPage", name: f.metaTitle, description: f.metaDescription, url },
      {
        "@type": "FAQPage",
        mainEntity: f.faq.map((q) => ({
          "@type": "Question",
          name: q.q,
          acceptedAnswer: { "@type": "Answer", text: q.a },
        })),
      },
    ],
  };
  const others = FEATURES.filter((x) => x.slug !== f.slug);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />
      <SiteHeader />
      <main className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link> › <span>{f.metaTitle.split(" – ")[0]}</span>
        </nav>
        <article className="prose">
          <header className="hero" style={{ textAlign: "left", paddingTop: 30 }}>
            <div className="ic" style={{ fontSize: "2.4rem" }}>
              {f.icon}
            </div>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)" }}>{f.title}</h1>
            <p className="lead" style={{ margin: "0 0 24px" }}>
              {f.summary}
            </p>
            <Link className="btn" href="/signup">
              Try it free
            </Link>
          </header>
          {f.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </section>
          ))}
          <section>
            <h2>Questions</h2>
            {f.faq.map((q) => (
              <details key={q.q} className="faq" open>
                <summary>{q.q}</summary>
                <p>{q.a}</p>
              </details>
            ))}
          </section>
          <section>
            <h2>Explore more</h2>
            <div className="grid g2">
              {others.map((o) => (
                <Link key={o.slug} href={`/features/${o.slug}`} className="card feature-card">
                  <div className="ic">{o.icon}</div>
                  <h3>{o.metaTitle.split(" – ")[0]}</h3>
                  <p>{o.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
