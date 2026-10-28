"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const COUNTRY_CODES = [
  ["+91", "🇮🇳 +91"],
  ["+1", "🇺🇸 +1"],
  ["+44", "🇬🇧 +44"],
  ["+971", "🇦🇪 +971"],
  ["+966", "🇸🇦 +966"],
  ["+65", "🇸🇬 +65"],
  ["+61", "🇦🇺 +61"],
  ["+49", "🇩🇪 +49"],
  ["+92", "🇵🇰 +92"],
  ["+880", "🇧🇩 +880"],
  ["+977", "🇳🇵 +977"],
  ["+94", "🇱🇰 +94"],
];

function useFinish() {
  const { signIn } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");
  return (t) => {
    signIn(t);
    router.replace(next && next.startsWith("/app") ? next : "/app");
  };
}

function RedirectIfSignedIn() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && user) router.replace("/app");
  }, [ready, user, router]);
  return null;
}

function DevCodes({ codes }) {
  if (!codes || !Object.keys(codes).length) return null;
  return (
    <div className="alert dev">
      🧪 Dev mode — AWS SES/SNS not configured, so codes are shown here instead of being sent.{" "}
      {Object.entries(codes).map(([k, v]) => (
        <b key={k} style={{ marginRight: 10 }}>
          {k === "email" ? "Email" : "SMS"}: {v}
        </b>
      ))}
    </div>
  );
}

const mask = (s) =>
  s.includes("@") ? s.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : `${s.slice(0, 3)} ••••• ${s.slice(-3)}`;

/* ------------------------------------------------------------------ verification step */
function Verify({ pending, onDone, onBack }) {
  const [state, setState] = useState(pending);
  const [codes, setCodes] = useState({ email: "", sms: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const channels = [
    { key: "email", label: "📧 Email", target: state.email, done: state.email_verified },
    ...(state.phone ? [{ key: "sms", label: "📱 Mobile", target: state.phone, done: state.phone_verified }] : []),
  ];

  async function verify(channel) {
    setErr("");
    setBusy(channel);
    try {
      const r = await api("/auth/verify", {
        method: "POST",
        json: { user_id: state.user_id, channel, code: codes[channel] },
      });
      setState({ ...state, email_verified: r.email_verified, phone_verified: r.phone_verified });
      if (r.token) onDone(r.token);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  async function resend(channel) {
    setErr("");
    try {
      const r = await api("/auth/resend", {
        method: "POST",
        json: { user_id: state.user_id, channel },
      });
      setState({ ...state, dev: { ...state.dev, ...(r.dev_code ? { [channel]: r.dev_code } : {}) } });
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>✉️ Verify your account</h2>
      <p className="muted">Enter the 6-digit codes we sent you.</p>
      <DevCodes codes={state.dev} />
      {channels.map((c) => (
        <div key={c.key} className="card" style={{ marginBottom: 12, padding: 16 }}>
          {c.done ? (
            <div className="alert ok" style={{ margin: 0 }}>
              {c.label} {mask(c.target)} — verified ✓
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 8 }}>
                <b>{c.label}</b> <span className="muted small">sent to {mask(c.target)}</span>
              </div>
              <div className="row">
                <input
                  className="otp"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  aria-label={`${c.key} code`}
                  value={codes[c.key]}
                  onChange={(e) => setCodes({ ...codes, [c.key]: e.target.value.replace(/\D/g, "") })}
                />
                <button
                  className="btn"
                  disabled={codes[c.key].length !== 6 || busy === c.key}
                  onClick={() => verify(c.key)}
                >
                  Verify
                </button>
                <button className="btn ghost" onClick={() => resend(c.key)}>
                  Resend
                </button>
              </div>
            </>
          )}
        </div>
      ))}
      {err && <div className="alert error">{err}</div>}
      <button className="btn ghost sm" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ sign in */
export function LoginForm() {
  const finish = useFinish();
  const [tab, setTab] = useState("password");
  const [ident, setIdent] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  const run = async (fn) => {
    setErr("");
    setOk("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const ae = e;
      const d = ae.detail;
      if (ae.status === 403 && d?.code === "unverified") {
        const dev = {};
        for (const ch of ["email", "sms"]) {
          if ((ch === "email" ? d.email_verified : d.phone_verified) || (ch === "sms" && !d.phone)) continue;
          try {
            const r = await api("/auth/resend", { method: "POST", json: { user_id: d.user_id, channel: ch } });
            if (r.dev_code) dev[ch] = r.dev_code;
          } catch {
            /* a code was sent moments ago */
          }
        }
        setPending({ ...d, dev });
      } else setErr(ae.message);
    } finally {
      setBusy(false);
    }
  };

  if (pending) return <Verify pending={pending} onDone={finish} onBack={() => setPending(null)} />;

  const switchTab = (t) => {
    setTab(t);
    setErr("");
    setOk("");
    setSentTo(null);
    setCode("");
  };

  return (
    <div>
      <RedirectIfSignedIn />
      <div className="tabs" role="tablist">
        {[
          ["password", "🔐 Password"],
          ["otp", "📲 One-time code"],
          ["reset", "🔑 Forgot password"],
        ].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "on" : ""}
            onClick={() => switchTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "password" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () =>
              finish(await api("/auth/login", { method: "POST", json: { identifier: ident.trim(), password } })),
            );
          }}
        >
          <label className="field">
            <span>Username, email or mobile number</span>
            <input
              autoComplete="username"
              required
              value={ident}
              onChange={(e) => setIdent(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn block" disabled={busy}>
            {busy ? <span className="spinner" /> : "Sign in"}
          </button>
        </form>
      )}

      {tab !== "password" && !sentTo && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await api("/auth/otp/request", {
                method: "POST",
                json: { identifier: ident.trim(), purpose: tab === "otp" ? "login" : "reset" },
              });
              setSentTo({ ident: ident.trim(), dev: r.dev_code });
            });
          }}
        >
          <p className="muted small">
            {tab === "otp"
              ? "Sign in without a password — we'll send a code to your email or mobile."
              : "We'll send a reset code to your email or mobile number."}
          </p>
          <label className="field">
            <span>Email or mobile number (with country code)</span>
            <input
              required
              value={ident}
              onChange={(e) => setIdent(e.target.value)}
              placeholder="you@example.com or +919876543210"
            />
          </label>
          <button className="btn block" disabled={busy}>
            Send code
          </button>
        </form>
      )}

      {tab !== "password" && sentTo && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (tab === "otp")
                finish(await api("/auth/otp/login", { method: "POST", json: { identifier: sentTo.ident, code } }));
              else {
                const r = await api("/auth/password/reset", {
                  method: "POST",
                  json: { identifier: sentTo.ident, code, new_password: password },
                });
                setOk(r.message);
                setSentTo(null);
                setTab("password");
                setPassword("");
              }
            });
          }}
        >
          <div className="alert info">
            If an account exists for <b>{sentTo.ident}</b>, a code is on its way.
          </div>
          <DevCodes codes={sentTo.dev ? { [sentTo.ident.includes("@") ? "email" : "sms"]: sentTo.dev } : undefined} />
          <label className="field">
            <span>6-digit code</span>
            <input
              className="otp"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          {tab === "reset" && (
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <div className="row">
            <button className="btn" disabled={busy}>
              {tab === "otp" ? "Sign in" : "Update password"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setSentTo(null)}>
              Use another account
            </button>
          </div>
        </form>
      )}

      {err && <div className="alert error">{err}</div>}
      {ok && <div className="alert ok">{ok}</div>}
      <p className="muted small" style={{ marginTop: 18 }}>
        New here? <Link href="/signup">Create a free account</Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ sign up */
export function SignupForm() {
  const finish = useFinish();
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState({
    full_name: "",
    username: "",
    email: "",
    cc: "+91",
    mobile: "",
    password: "",
    confirm: "",
  });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    api("/auth/config")
      .then(setCfg)
      .catch((e) => setErr(e.message));
  }, []);

  if (pending) return <Verify pending={pending} onDone={finish} onBack={() => setPending(null)} />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const needPhone = cfg?.require_verification ?? false;

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (f.password !== f.confirm) return setErr("Passwords do not match");
    if (!agree) return setErr("Please accept the Terms to continue");
    const digits = f.mobile.replace(/\D/g, "").replace(/^0+/, "");
    if (needPhone && !digits) return setErr("Enter your mobile number");
    setBusy(true);
    try {
      const r = await api("/auth/register", {
        method: "POST",
        json: {
          username: f.username.trim(),
          full_name: f.full_name.trim(),
          email: f.email.trim(),
          phone: digits ? f.cc + digits : null,
          password: f.password,
        },
      });
      if (r.token) finish(r.token);
      else
        setPending({
          user_id: r.user_id,
          email: r.email,
          phone: r.phone,
          email_verified: false,
          phone_verified: false,
          dev: r.dev_codes ?? undefined,
        });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <RedirectIfSignedIn />
      <h2 style={{ marginTop: 0 }}>Create your free account</h2>
      <div className="row">
        <label className="field">
          <span>Full name</span>
          <input autoComplete="name" value={f.full_name} onChange={set("full_name")} placeholder="Neha Sharma" />
        </label>
        <label className="field">
          <span>Username</span>
          <input
            autoComplete="username"
            required
            minLength={3}
            value={f.username}
            onChange={set("username")}
            placeholder="neha_s"
          />
        </label>
      </div>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={f.email}
          onChange={set("email")}
          placeholder="you@example.com"
        />
      </label>
      <label className="field">
        <span>Mobile number {needPhone ? "" : <i className="muted">(optional)</i>}</span>
        <div className="row" style={{ gap: 8 }}>
          <select style={{ maxWidth: 120 }} value={f.cc} onChange={set("cc")} aria-label="Country code">
            {COUNTRY_CODES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            type="tel"
            autoComplete="tel-national"
            required={needPhone}
            value={f.mobile}
            onChange={set("mobile")}
            placeholder="98765 43210"
          />
        </div>
      </label>
      <div className="row">
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={f.password}
            onChange={set("password")}
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" autoComplete="new-password" required value={f.confirm} onChange={set("confirm")} />
        </label>
      </div>
      <p className="muted small" style={{ marginTop: -6 }}>
        At least 8 characters with letters and numbers.
      </p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0 16px" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />{" "}
        <span className="small">I agree to the Terms and Privacy Policy</span>
      </label>
      <button className="btn block" disabled={busy || !cfg}>
        {busy ? <span className="spinner" /> : "Create account"}
      </button>
      {cfg?.require_verification && (
        <p className="muted small">You&apos;ll confirm your email and mobile with one-time codes next.</p>
      )}
      {err && <div className="alert error">{err}</div>}
      <p className="muted small" style={{ marginTop: 18 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
