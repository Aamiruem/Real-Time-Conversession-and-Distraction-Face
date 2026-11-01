import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setGuestRenewal, setToken } from "./api";

const AuthContext = createContext({ user: null, ready: false, offline: false, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // backend unreachable while a saved login exists: keep the login and retry instead of signing out
  const [offline, setOffline] = useState(false);

  const restore = useCallback(
    () =>
      api("/auth/me")
        .then((u) => {
          setUser(u);
          setOffline(false);
        })
        .catch((e) => {
          if (e.status === 401 || e.status === 403 || e.status === 404) {
            setToken(null); // the token was rejected (expired, or the account is gone): sign out
            setOffline(false);
          } else setOffline(true);
        })
        .finally(() => setReady(true)),
    [],
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
    setToken(t.access_token);
    setUser(t.user);
    setOffline(false);
  }, []);

  // guests: a rejected login is replaced by a new guest login behind the scenes (see setGuestRenewal in api.js)
  const isGuest = !!user?.username?.startsWith("guest-");
  useEffect(() => {
    if (!isGuest) return setGuestRenewal(null);
    setGuestRenewal(async () => {
      const t = await api("/auth/guest", { method: "POST" });
      setToken(t.access_token);
      setUser(t.user);
      return true;
    });
    return () => setGuestRenewal(null);
  }, [isGuest]);

  const signOut = useCallback(() => {
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
