import { useEffect } from "react";
import { useLocation } from "react-router";
import { metaTags, pageMeta } from "@/lib/seo";

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

/** Keeps <title>, meta tags and the canonical link in sync with the current route (same data as the pre-render). */
export function SeoSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = pageMeta(pathname);
    const t = metaTags(m);
    document.title = m.title;
    for (const [k, v] of Object.entries(t.name)) setMeta("name", k, v);
    for (const [k, v] of Object.entries(t.property)) setMeta("property", k, v);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (t.canonical) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = t.canonical;
    } else link?.remove();
  }, [pathname]);
  return null;
}
