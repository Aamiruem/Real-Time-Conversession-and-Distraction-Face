import { useState } from "react";
import { PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/navigation";

function Section({ icon, title, sub, children, danger }) {
  return (
    <section className={`card settings-card ${danger ? "danger-zone" : ""}`}>
      <header>
        <span className="nav-ico" style={{ "--c": danger ? "#ef4444" : "#38bdf8" }}>
          {icon}
        </span>
        <div>
          <h3>{title}</h3>
          <p className="small muted">{sub}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export default function Settings() {
  const { user, updateUser, signOut } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user.full_name || "");
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [del, setDel] = useState({ password: "", confirm: false });
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState("");

  const run = async (key, fn) => {
    setBusy(key);
    setMsg((m) => ({ ...m, [key]: null }));
    try {
      const text = await fn();
      setMsg((m) => ({ ...m, [key]: { ok: true, text } }));
    } catch (e) {
      setMsg((m) => ({ ...m, [key]: { ok: false, text: e.message } }));
    } finally {
      setBusy("");
    }
  };
  const Note = ({ k }) => msg[k] && <div className={`alert ${msg[k].ok ? "ok" : "error"}`}>{msg[k].text}</div>;

  return (
    <>
      <PageHead eyebrow="Account" title="Account settings" highlight="settings" sub="Your profile, password and data." />
      <div className="settings">
        <Section icon="👤" title="Profile" sub={`@${user.username} · ${user.email}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("profile", async () => {
                updateUser(await api("/auth/me", { method: "PATCH", json: { full_name: name } }));
                return "Profile saved.";
              });
            }}
          >
            <label className="field">
              <span>Display name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Your name" />
            </label>
            <button className="btn sm" disabled={busy === "profile"}>
              Save
            </button>
            <Note k="profile" />
          </form>
        </Section>

        <Section icon="🔑" title="Password" sub="At least 8 characters with letters and numbers.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("password", async () => {
                const r = await api("/auth/password", { method: "POST", json: pw });
                setPw({ current_password: "", new_password: "" });
                return r.message;
              });
            }}
          >
            <div className="grid g2" style={{ gap: 12 }}>
              <label className="field">
                <span>Current password</span>
                <input type="password" autoComplete="current-password" value={pw.current_password}
                  onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required />
              </label>
              <label className="field">
                <span>New password</span>
                <input type="password" autoComplete="new-password" minLength={8} value={pw.new_password}
                  onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required />
              </label>
            </div>
            <button className="btn sm" disabled={busy === "password"}>
              Change password
            </button>
            <Note k="password" />
          </form>
        </Section>

        <Section icon="🗑️" title="Delete account" sub="Permanently removes your account and everything stored about you." danger>
          <p className="small">
            This deletes your focus sessions, recordings' results, interview answers, chat messages and the rooms you
            created. It can't be undone.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("delete", async () => {
                await api("/auth/me", { method: "DELETE", json: { password: del.password } });
                signOut();
                router.replace("/");
                return "Deleted.";
              });
            }}
          >
            <label className="field">
              <span>Your password</span>
              <input type="password" autoComplete="current-password" value={del.password}
                onChange={(e) => setDel({ ...del, password: e.target.value })} required />
            </label>
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input type="checkbox" checked={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.checked })} />
              I understand this permanently deletes my data
            </label>
            <button className="btn danger sm" disabled={!del.confirm || !del.password || busy === "delete"}>
              Delete my account
            </button>
            <Note k="delete" />
          </form>
        </Section>
      </div>
    </>
  );
}
