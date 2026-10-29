// After `vite build`: renders the public pages to static HTML so search engines (and visitors) get the full
// page instantly, with its own <title>, meta tags and JSON-LD. Also writes sitemap.xml, robots.txt and the manifest.
//   dist/index.html, dist/features/<slug>/index.html, dist/login/…, dist/signup/…  -> pre-rendered
//   dist/app.html                                                                   -> empty shell for /app/* (SPA)
//   dist/404.html                                                                   -> pre-rendered "not found"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ssr = await import(pathToFileURL("dist-ssr/entry-server.js").href);
const { render, pageMeta, headTags, FEATURES, SITE_URL, SITE_NAME, DESCRIPTION } = ssr;
const template = await readFile("dist/index.html", "utf8");

const page = (path, html) =>
  template
    .replace("<!--app-head-->", headTags(pageMeta(path)))
    .replace('<div id="root"><!--app-html--></div>', html == null ? '<div id="root"></div>' : `<div id="root" data-path="${path}">${html}</div>`);

await writeFile("dist/app.html", page("/app", null)); // shell for the signed-in app (rendered in the browser)

const routes = ["/", ...FEATURES.map((f) => `/features/${f.slug}`), "/login", "/signup"];
for (const route of routes) {
  const file = route === "/" ? "dist/index.html" : `dist${route}/index.html`;
  await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  await writeFile(file, page(route, render(route)));
}
await writeFile("dist/404.html", page("/404", render("/404")).replace(' data-path="/404"', ""));

const now = new Date().toISOString().slice(0, 10);
const urls = [
  ["/", "weekly", "1.0"],
  ...FEATURES.map((f) => [`/features/${f.slug}`, "monthly", "0.8"]),
  ["/signup", "yearly", "0.5"],
];
await writeFile(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([u, f, p]) => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${now}</lastmod><changefreq>${f}</changefreq><priority>${p}</priority></url>`)
    .join("\n")}\n</urlset>\n`,
);
await writeFile(
  "dist/robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /api/\nDisallow: /verify\n\nHost: ${SITE_URL}\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);
await writeFile(
  "dist/manifest.webmanifest",
  JSON.stringify(
    {
      id: "/app",
      name: SITE_NAME,
      short_name: "Presence",
      description: DESCRIPTION,
      start_url: "/app",
      scope: "/",
      display: "standalone",
      display_override: ["window-controls-overlay", "standalone"],
      background_color: "#0b1120",
      theme_color: "#0b1120",
      categories: ["education", "productivity", "business"],
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
      // long-press / right-click the app icon
      shortcuts: [
        { name: "New meeting", short_name: "Meet", url: "/app/meet", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
        { name: "Interview practice", short_name: "Interview", url: "/app/interview", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
        { name: "Focus session", short_name: "Focus", url: "/app/focus", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      ],
    },
    null,
    2,
  ),
);
await rm("dist-ssr", { recursive: true, force: true });
console.log(`pre-rendered ${routes.length} pages + 404, app shell, sitemap.xml, robots.txt, manifest`);
