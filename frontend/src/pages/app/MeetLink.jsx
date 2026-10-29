// A meeting's own link, like meet.google.com/abc-defg-hij: <site>/<code> opens the meeting full screen.
// Signed in: straight to the lobby. Not signed in: "What's your name?" and you're in, as a guest (no account).
import { useEffect, useState } from "react";
import Link from "@/components/Link";
import { Icon } from "@/components/MeetIcons";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Meet from "./Meet";

const NAME_KEY = "presence.meet.name";
const timeNow = () =>
  new Date().toLocaleString([], { hour: "numeric", minute: "2-digit", weekday: "short", month: "short", day: "numeric" });

function Clock() {
  const [now, setNow] = useState(timeNow());
  useEffect(() => {
    const id = setInterval(() => setNow(timeNow()), 15000);
    return () => clearInterval(id);
  }, []);
  return <span className="gm-solo-clock">{now}</span>;
}

/** Meet's guest screen: a name, then join. */
function GuestJoin({ code }) {
  const { signIn } = useAuth();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const t = await api("/auth/guest", { method: "POST", json: { name: name.trim() } });
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        /* private window: just don't remember it */
      }
      signIn(t);
    } catch (e2) {
      setBusy(false);
      setErr(e2.status === 403 ? "This site needs an account to join meetings — please sign in." : e2.message);
    }
  };
  const insecure = !window.isSecureContext;
  return (
    <form className="gm-guest" onSubmit={join}>
      <div className="gm-art-circle small" aria-hidden="true">
        <Icon name="videoCall" size={48} />
      </div>
      <h1>What&apos;s your name?</h1>
      <p className="gm-lobby-who">
        Joining meeting <b>{code}</b>
      </p>
      <input
        className="gm-guest-name"
        aria-label="Your name"
        placeholder="Your name"
        maxLength={60}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="gm-primary big" disabled={busy || !name.trim()}>
        {busy ? "Joining…" : "Continue"}
      </button>
      {insecure && (
        <p className="gm-note warn">
          <Icon name="info" size={16} /> This link is <b>http://</b>, so your browser will block the camera and microphone. Ask the host for the
          https:// link.
        </p>
      )}
      {err && <div className="alert error">{err}</div>}
      <p className="muted small">
        Have an account? <Link href={`/login?next=${encodeURIComponent(`/${code}`)}`}>Sign in</Link> instead.
      </p>
    </form>
  );
}

export default function MeetLink({ code }) {
  const { user, ready, offline } = useAuth();
  return (
    <div className="gm-solo">
      <header className="gm-solo-bar">
        <Link href={user ? "/app/meet" : "/"} className="gm-solo-brand">
          <Icon name="videoCall" size={26} /> Presence <b>Meet</b>
        </Link>
        <Clock />
      </header>
      <main className="gm-solo-main">
        {!ready ? (
          <p className="gm-lobby-who">Loading…</p>
        ) : user ? (
          <Meet code={code} />
        ) : offline ? (
          <p className="gm-lobby-who">Can&apos;t reach the server — retrying…</p>
        ) : (
          <GuestJoin code={code} />
        )}
      </main>
    </div>
  );
}
