// Install Presence AI as an app (desktop and phone): service worker + the browser's install prompt.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icons";

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

/** iPhone / iPad: Safari has no install prompt; the app is installed from its Share menu instead. */
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * "Install app" button: the browser's install prompt (Chrome, Edge, Android), or on iPhone / iPad a short how-to
 * (Share -> Add to Home Screen). Renders nothing where neither applies or the app is already installed.
 */
export function InstallButton({ className = "btn ghost sm", label = "Install app" }) {
  const { canInstall, install } = useInstallPrompt();
  const [ios, setIos] = useState(false); // decided after mount: the pre-rendered HTML has no navigator
  const [tip, setTip] = useState(false);
  useEffect(() => setIos(isIOS() && !installed()), []);
  if (canInstall) {
    return (
      <button className={className} onClick={install} aria-label={label} title="Install Presence AI as an app on this device">
        <Icon name="download" size={16} /> <span className="btn-label">{label}</span>
      </button>
    );
  }
  if (!ios) return null;
  return (
    <span className="install-ios">
      <button className={className} onClick={() => setTip((v) => !v)} aria-expanded={tip} aria-label={label} title={label}>
        <Icon name="download" size={16} /> <span className="btn-label">{label}</span>
      </button>
      {tip && (
        <span className="install-tip" role="note">
          In Safari tap <b>Share</b> <Icon name="share" size={14} />, then <b>Add to Home Screen</b>.
        </span>
      )}
    </span>
  );
}
