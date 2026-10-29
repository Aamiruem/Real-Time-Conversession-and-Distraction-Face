// Install Presence AI as an app (desktop and phone): service worker + the browser's install prompt.
import { useSyncExternalStore } from "react";

let deferred = null; // the browser's install prompt, saved until the user clicks "Install app"
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function registerServiceWorker() {
  if (import.meta.env.DEV || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own button instead of the mini-infobar
    deferred = e;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

const installed = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

/** { canInstall, install } — canInstall is true only when the browser offers installation right now. */
export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => !!deferred && !installed(),
    () => false,
  );
  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null; // a prompt can be used once
    emit();
  };
  return { canInstall, install };
}

/** "Install app" button; renders nothing when the browser can't install (or it's already installed). */
export function InstallButton({ className = "btn ghost sm", label = "⬇ Install app" }) {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button className={className} onClick={install} title="Install Presence AI as an app on this device">
      {label}
    </button>
  );
}
