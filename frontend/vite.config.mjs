// Vite + React. All app code lives in src/ (index.html too); public/ and .env* stay at the project root.
// The browser calls /api/* on this origin and the dev/preview server proxies it to FastAPI (no CORS).
//
//   npm run dev       http://localhost:3000            (this computer)
//   npm run dev:lan   https://<your-wifi-ip>:3000      (phones / laptops on the same Wi-Fi: camera + mic need HTTPS)
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/** This computer's address on the local network (Wi-Fi / Ethernet), e.g. 192.168.1.16. */
function lanAddress() {
  const candidates = Object.entries(networkInterfaces())
    .filter(([name]) => !/vethernet|virtual|vmware|vbox|docker|wsl|loopback|bluetooth/i.test(name))
    .flatMap(([, addrs]) => addrs ?? [])
    .filter((a) => a.family === "IPv4" && !a.internal);
  const privateIp = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return (candidates.find((a) => a.address.startsWith("192.168.")) ?? candidates.find((a) => privateIp(a.address)))?.address ?? "";
}

/**
 * Search engine + analytics tags in every page's <head>, from build-time environment variables (Vercel: Settings ->
 * Environment Variables, then redeploy). Both are optional; without them nothing is added.
 *   GOOGLE_SITE_VERIFICATION  the content="…" value of Search Console's "HTML tag" ownership check
 *   GA_MEASUREMENT_ID         Google Analytics 4 id, G-XXXXXXXXXX
 */
function siteTags(env) {
  const verify = (env.GOOGLE_SITE_VERIFICATION || "").trim();
  const ga = (env.GA_MEASUREMENT_ID || "").trim();
  const safe = (v) => /^[\w.-]+$/.test(v); // ids only: never let a setting inject markup
  return {
    name: "site-tags",
    transformIndexHtml() {
      const tags = [];
      if (verify && safe(verify)) {
        tags.push({ tag: "meta", attrs: { name: "google-site-verification", content: verify }, injectTo: "head" });
      }
      if (ga && safe(ga)) {
        tags.push(
          { tag: "script", attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${ga}` }, injectTo: "head" },
          {
            tag: "script",
            children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${ga}",{send_page_view:false});`,
            injectTo: "head",
          },
        );
      }
      return tags;
    },
  };
}

export default defineConfig(({ command, mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // canonical links, sitemap, robots.txt and share previews use VITE_SITE_URL; on Vercel it defaults to the
  // project's production address (never http://localhost:3000, which would keep the site out of Google)
  if (command === "build" && !env.VITE_SITE_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    process.env.VITE_SITE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const lan = mode === "lan";
  if (command === "serve") {
    // dev only (never in builds, so a deployed site contains no local paths or addresses):
    //  - the project folder, for the "backend offline" notice's start command
    //  - this computer's network address, so meeting invite links work for other devices
    process.env.VITE_PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
    process.env.VITE_LAN_IP = lanAddress();
  }
  const backend = (env.BACKEND_URL || "http://127.0.0.1:8010").replace(/\/$/, "");
  const proxy = {
    "/api": {
      target: backend,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ""),
      timeout: 180_000, // the first speech analysis loads the Whisper model
      proxyTimeout: 180_000,
    },
    "/ws": { target: backend, ws: true, changeOrigin: true }, // rooms chat + meeting signaling
  };
  // listen on the network too (not only localhost), and accept the free tunnel services for sharing outside it
  const server = {
    port: 3000,
    host: true,
    proxy,
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io", ".loca.lt", ".lhr.life", ".localhost.run"],
  };
  return {
    root: "src",
    // the SSR build only feeds scripts/prerender.mjs: don't copy public/ (≈100 MB of AI models) into dist-ssr
    publicDir: isSsrBuild ? false : "../public",
    envDir: "..",
    // npm run dev (= dev:lan): a self-signed HTTPS certificate (others accept it once) — browsers only allow
    // camera/mic on HTTPS, so meeting links on your Wi-Fi need it. npm run dev:http serves plain http.
    plugins: [react(), siteTags({ ...env, ...process.env }), ...(lan ? [basicSsl({ name: "presence-ai-lan" })] : [])],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server,
    preview: server,
    build: {
      outDir: isSsrBuild ? "../dist-ssr" : "../dist",
      emptyOutDir: true,
      target: "es2022",
      rollupOptions: isSsrBuild
        ? { input: fileURLToPath(new URL("./src/entry-server.jsx", import.meta.url)) } // used by scripts/prerender.mjs
        : {
            output: {
              // recharts is left to automatic splitting so it only loads with the pages that draw charts
              manualChunks: { react: ["react", "react-dom", "react-dom/client", "react-router"] },
            },
          },
    },
  };
});
