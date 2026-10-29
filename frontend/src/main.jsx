import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { registerServiceWorker } from "./lib/pwa";
import App from "./Root";
import "./styles/globals.css";

const root = document.getElementById("root");
const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

registerServiceWorker(); // installable app + instant repeat visits (production only)

// Pre-rendered pages (scripts/prerender.mjs) carry their path; hydrate those, render everything else fresh.
const norm = (p) => p.replace(/\/+$/, "") || "/";
if (root.dataset.path && norm(root.dataset.path) === norm(window.location.pathname)) {
  hydrateRoot(root, app);
} else {
  root.textContent = "";
  createRoot(root).render(app);
}
