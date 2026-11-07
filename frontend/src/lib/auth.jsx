import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setGuestRenewal, setLoginRejected, setToken } from "./api";

// Signing out on purpose is remembered on this device: the app then shows the login page instead of opening a new
// guest session by itself. Any sign-in (including "Continue as guest") clears it.
const SIGNED_OUT_KEY = "focuslink.signedOut";
export function wasSignedOut() {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberSignedOut(on) {
  try {
    if (on) localStorage.setItem(SIGNED_OUT_KEY, "1");
    else localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* private mode */
  }
}

// Which kind of account this device last used. A dead login on a guest device is replaced by a new guest; any other
// goes to the sign-in page, because a new guest would hide a real account's data behind an empty one.
const ACCOUNT_KIND_KEY = "presence.accountKind";
const EXPIRED_KEY = "presence.sessionExpired";
const remember = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
};
const recall = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const rememberAccount = (user) => remember(ACCOUNT_KIND_KEY, user?.username?.startsWith("guest-") ? "guest" : "account");

/** True when the last sign-out happened because the login expired, so the sign-in page can say so. */
export const sessionExpired = () => recall(EXPIRED_KEY) === "1";

const AuthContext = createContext({ user: null, ready: false, offline: false, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // backend unreachable while a saved login exists: keep the login and retry instead of signing out
  const [offline, setOffline] = useState(false);

  const expire = useCallback(() => {
    rememberSignedOut(true);
    remember(EXPIRED_KEY, "1");
    setToken(null);
    setUser(null);
    setOffline(false);
  }, []);
  useEffect(() => {
    setLoginRejected(expire);
    return () => setLoginRejected(null);
  }, [expire]);

  const restore = useCallback(
    () =>
      api("/auth/me")
        .then((u) => {
          rememberAccount(u);
          setUser(u);
          setOffline(false);
        })
        .catch((e) => {
          if (e.status === 401 || e.status === 403 || e.status === 404) {
            // the token was rejected (expired, or the account is gone)
            if (recall(ACCOUNT_KIND_KEY) === "guest") setToken(null); // AppShell opens a new guest session
            else expire();
            setOffline(false);
          } else setOffline(true);
        })
        .finally(() => setReady(true)),
    [expire],
  );

  // The JWT lives in localStorage, so a page refresh keeps you signed in.
  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    restore();
  }, [restore]);

  useEffect(() => {
    if (!offline) return;
    const id = setInterval(restore, 5000);
    return () => clearInterval(id);
  }, [offline, restore]);

  const signIn = useCallback((t) => {
    rememberSignedOut(false);
    remember(EXPIRED_KEY, null);
    rememberAccount(t.user);
    setToken(t.access_token);
    setUser(t.user);
    setOffline(false);
  }, []);

  // guests: a rejected login is replaced by a new guest login behind the scenes (see setGuestRenewal in api.js)
  const isGuest = !!user?.username?.startsWith("guest-");
  useEffect(() => {
    if (!isGuest) {
      setGuestRenewal(null);
      return undefined; // an effect returns a cleanup function or nothing — React calls anything else
    }
    setGuestRenewal(async () => {
      const t = await api("/auth/guest", { method: "POST" });
      setToken(t.access_token);
      setUser(t.user);
      return true;
    });
    return () => setGuestRenewal(null);
  }, [isGuest]);

  const signOut = useCallback(() => {
    rememberSignedOut(true);
    remember(EXPIRED_KEY, null);
    setToken(null);
    setUser(null);
    setOffline(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, offline, signIn, signOut, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
