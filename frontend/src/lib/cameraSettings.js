// Camera quality + AI tracking speed, shared by every camera page and remembered on this device. Changed from the
// player's ⚙ settings menu (CameraDock); useFaceTracker follows it live.
import { useSyncExternalStore } from "react";

const KEY = "presence.camera.v2"; // v2: the default rose to 1080p, so older saved "720p" settings are left behind
const DEFAULTS = { quality: "high", speed: "realtime" };

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let current = typeof window === "undefined" ? DEFAULTS : read();
const listeners = new Set();

export function setCameraSetting(key, value) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode — kept for this visit */
  }
  listeners.forEach((l) => l());
}

/** { quality, speed } — re-renders when either changes. */
export function useCameraSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => DEFAULTS,
  );
}
