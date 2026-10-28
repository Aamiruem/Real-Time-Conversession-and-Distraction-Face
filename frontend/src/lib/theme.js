// Light / dark theme: your choice is remembered; without one we follow the system setting.
// index.html applies the saved theme before the first paint, so pages never flash the wrong colours.
import { useCallback, useEffect, useState } from "react";

const KEY = "focuslink.theme";

const systemTheme = () => (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");

export function useTheme() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || systemTheme());
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const follow = () => {
      let saved = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {
        /* storage blocked */
      }
      if (!saved) apply(systemTheme(), false);
    };
    mq?.addEventListener("change", follow);
    return () => mq?.removeEventListener("change", follow);
  }, []);

  const apply = useCallback((next, remember = true) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    if (remember) {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode — this visit only */
      }
    }
  }, []);

  const toggle = useCallback(() => apply(theme === "dark" ? "light" : "dark"), [apply, theme]);
  return { theme, toggle };
}

/** Sun / moon switch. */
export function themeLabel(theme) {
  return theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
}
