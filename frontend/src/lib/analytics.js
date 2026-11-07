// Google Analytics 4. The tag is added at build time only when GA_MEASUREMENT_ID is set (vite.config.mjs), so all of
// this does nothing without it. A meeting's address is its invite: it's never sent, and neither are query strings.
import { isMeetingPath } from "./seo";

const safePath = (pathname) => (isMeetingPath(pathname) ? "/meeting" : pathname);

/** The app changes pages without reloading, so each one is reported here. */
export function trackPage(pathname, title) {
  const path = safePath(pathname);
  const page_location = `${window.location.origin}${path}`;
  window.gtag?.("set", { page_location, page_title: title }); // automatic events (scrolls, clicks) use these too
  window.gtag?.("event", "page_view", { page_path: path, page_title: title, page_location });
}

/** A GA4 event, e.g. track("sign_up", { method: "email" }). Never pass anything personal. */
export const track = (name, params) => window.gtag?.("event", name, params);
