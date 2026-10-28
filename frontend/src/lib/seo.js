// Per-page SEO: title, description, canonical URL, robots and social tags.
// Used twice so they always agree: scripts/prerender.mjs writes them into the static HTML (what crawlers read),
// and components/Seo.jsx updates <head> on client-side navigation.
import { DESCRIPTION, FEATURES, SITE_NAME, SITE_URL, TAGLINE } from "./site";

const KEYWORDS = [
  "focus tracker",
  "attention detection",
  "distraction detection",
  "drowsiness detection",
  "AI speech coach",
  "public speaking confidence",
  "pronunciation practice",
  "fatigue prediction",
  "study focus app",
  "mock interview practice",
  "AI interview preparation",
  "body language analysis",
  "communication skills practice",
  "voice modulation",
];

export function pageMeta(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const base = {
    title: `${SITE_NAME} – ${TAGLINE}`,
    description: DESCRIPTION,
    keywords: KEYWORDS,
    canonical: path,
    robots: "index, follow, max-image-preview:large",
    type: "website",
  };
  if (path === "/") return base;
  const feature = path.startsWith("/features/") && FEATURES.find((f) => `/features/${f.slug}` === path);
  if (feature) {
    return {
      ...base,
      title: `${feature.metaTitle} | ${SITE_NAME}`,
      description: feature.metaDescription,
      keywords: feature.keywords,
      type: "article",
    };
  }
  if (path === "/login") {
    return {
      ...base,
      title: `Sign in | ${SITE_NAME}`,
      description: "Sign in to FocusLink AI with your password or a one-time code sent to your email or mobile.",
      robots: "noindex, follow",
    };
  }
  if (path === "/signup") {
    return {
      ...base,
      title: `Create your free account | ${SITE_NAME}`,
      description:
        "Sign up for FocusLink AI: free webcam focus tracking, mock interviews, an AI speech coach and fatigue prediction.",
    };
  }
  // the signed-in app is private: keep it out of search results
  if (path === "/app" || path.startsWith("/app/")) return { ...base, title: `App | ${SITE_NAME}`, robots: "noindex, nofollow" };
  return { ...base, title: `Page not found | ${SITE_NAME}`, robots: "noindex, follow", canonical: null };
}

/** The tags for one page, as name → value pairs ("name" or "property" meta, plus <link rel=canonical>). */
export function metaTags(m) {
  const url = m.canonical ? `${SITE_URL}${m.canonical === "/" ? "/" : m.canonical}` : null;
  return {
    name: {
      description: m.description,
      keywords: m.keywords.join(", "),
      robots: m.robots,
      "twitter:card": "summary_large_image",
      "twitter:title": m.title,
      "twitter:description": m.description,
      "twitter:image": `${SITE_URL}/twitter-image.png`,
    },
    property: {
      "og:type": m.type,
      "og:site_name": SITE_NAME,
      "og:title": m.title,
      "og:description": m.description,
      "og:image": `${SITE_URL}/opengraph-image.png`,
      ...(url ? { "og:url": url } : {}),
    },
    canonical: url,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Static <head> HTML for the pre-renderer. */
export function headTags(m) {
  const t = metaTags(m);
  return [
    `<title>${esc(m.title)}</title>`,
    ...Object.entries(t.name).map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`),
    ...Object.entries(t.property).map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`),
    t.canonical ? `<link rel="canonical" href="${esc(t.canonical)}">` : "",
  ]
    .filter(Boolean)
    .join("\n    ");
}
