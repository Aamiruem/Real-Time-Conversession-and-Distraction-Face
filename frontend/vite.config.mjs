// Vite + React. All app code lives in src/ (index.html too); public/ and .env* stay at the project root.
// The browser calls /api/* on this origin and the dev/preview server proxies it to FastAPI (no CORS).
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = (env.BACKEND_URL || "http://127.0.0.1:8010").replace(/\/$/, "");
  const proxy = {
    "/api": {
      target: backend,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ""),
      timeout: 180_000, // the first speech analysis loads the Whisper model
      proxyTimeout: 180_000,
    },
  };
  return {
    root: "src",
    publicDir: "../public",
    envDir: "..",
    plugins: [react()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: { port: 3000, proxy },
    preview: { port: 3000, proxy },
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
