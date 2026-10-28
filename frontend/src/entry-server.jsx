// Build-time entry for scripts/prerender.mjs: renders the public pages to HTML (no browser needed).
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import App from "./Root";

export { headTags, pageMeta } from "./lib/seo";
export { DESCRIPTION, FEATURES, SITE_NAME, SITE_URL } from "./lib/site";

export function render(url) {
  return renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );
}
