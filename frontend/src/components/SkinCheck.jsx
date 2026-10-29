// Vision Studio → Skin check: a 3-second scan of how your skin looks on camera, with care advice, lifestyle,
// exercise and yoga, and the warning signs that need a doctor. Appearance only — never a diagnosis.
import { useEffect, useRef, useState } from "react";
import { ADVICE, DAILY_ROUTINE, EXERCISE, LIFESTYLE, measureFrame, SEE_A_DOCTOR, summarizeScan, YOGA } from "@/lib/skin";
import { Icon } from "./Icons";
import { RoutinePlayer } from "./RoutinePlayer";

const SCAN_MS = 3000;
const HISTORY_KEY = "presence.skin.history";
const LEVEL_COLOR = { low: "var(--ok)", moderate: "var(--warn)", high: "var(--bad)" };

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function AdviceCard({ a, level }) {
  return (
    <article className="skin-advice" style={{ "--lc": LEVEL_COLOR[level] }}>
      <h4>{a.title}</h4>
      <ul>
        {a.care.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="skin-label">Ingredients to ask a pharmacist about</p>
      <div className="skin-chips">
        {a.ingredients.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {a.habits?.map((t) => (
        <p key={t} className="small muted">
          💡 {t}
        </p>
      ))}
      {a.doctor && <p className="skin-doctor small">🩺 {a.doctor}</p>}
    </article>
  );
}

/** @param {{ running: boolean, faceOn: boolean, getFrame: () => {video: HTMLVideoElement, landmarks: any}, onZones: (on: boolean) => void }} props */
export function SkinCheck({ running, faceOn, getFrame, onZones }) {
  const [phase, setPhase] = useState("idle"); // idle | scanning | done
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(loadHistory);
  const timer = useRef(0);
  const canvas = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const scan = () => {
    setError("");
    setPhase("scanning");
    setProgress(0);
    onZones(true);
    canvas.current ??= document.createElement("canvas");
    const frames = [];
    let cutOff = 0;
    const t0 = performance.now();
    timer.current = setInterval(() => {
      const { video, landmarks } = getFrame();
      const m = measureFrame(video, landmarks, canvas.current);
      if (m?.cutOff) cutOff += 1;
      else if (m) frames.push(m);
      const p = (performance.now() - t0) / SCAN_MS;
      setProgress(Math.min(1, p));
      if (p < 1) return;
      clearInterval(timer.current);
      onZones(false);
      const r = summarizeScan(frames);
      if (!r) {
        setPhase("idle");
        setError(
          cutOff > frames.length
            ? "Your face is too close — move back a little so your whole face, forehead to chin, is in the picture."
            : "Couldn't see your face clearly — look straight at the camera, move a little closer and try again.",
        );
        return;
      }
      setResult(r);
      setPhase("done");
      if (r.light.ok) {
        const next = [...loadHistory(), { at: r.at, clarity: r.clarity, traits: Object.fromEntries(r.traits.map((t) => [t.id, t.value])) }].slice(-20);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          /* private window: no history */
        }
        setHistory(next);
      }
    }, 100);
  };

  const prev = result?.light.ok ? history.at(-2) : history.at(-1);
  const delta = result && prev ? result.clarity - prev.clarity : null;
  // the top 3 visible findings (a long list of "problems" from one webcam scan helps nobody)
  const findings = result?.light.ok ? result.traits.filter((t) => t.value >= 30).sort((a, b) => b.value - a.value).slice(0, 3) : [];
  const advice = [...findings.map((t) => [ADVICE[t.id], t.level, t.id]), ...(result?.light.ok && result.dryLooking ? [[ADVICE.dry, "moderate", "dry"]] : [])];

  return (
    <section className="card skin tinted" style={{ "--c": "#db2777" }} aria-labelledby="skin-title">
      <header className="chart-head">
        <span className="nav-ico">
          <Icon name="sparkles" size={17} />
        </span>
        <div className="chart-head-text">
          <h3 id="skin-title">
            Skin check <span className="skin-badge">appearance only · not a diagnosis</span>
          </h3>
          <p className="small muted">3-second scan of redness, blemishes, shine, tone, texture and dark circles — with care, lifestyle, exercise and yoga tips.</p>
        </div>
        <button className="btn sm" onClick={scan} disabled={!running || !faceOn || phase === "scanning"}>
          {phase === "scanning" ? `Scanning… ${Math.round(progress * 100)}%` : result ? "Scan again" : "Scan my skin"}
        </button>
      </header>

      {!running && <p className="muted small">Start the camera above, then face it straight on in even light (a window in front of you is best).</p>}
      {running && !faceOn && <p className="alert">Turn on “Face mesh + expressions” above — the skin check uses it to find each zone.</p>}
      {phase === "scanning" && (
        <div className="skin-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {error && <div className="alert error">{error}</div>}

      {result && (
        <>
          {!result.light.ok && (
            <div className="alert">
              <b>The picture isn't good enough to judge skin</b> (quality {result.light.score}/100), so no scores are shown. Fix
              this and scan again:
              <ul>
                {result.light.issues.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {result.light.ok && (
          <div className="skin-result">
            <div className="skin-score">
              <b>{result.clarity}</b>
              <span>skin clarity</span>
              {delta != null && (
                <small className={delta >= 0 ? "up" : "down"}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs {new Date(prev.at).toLocaleDateString()}
                </small>
              )}
              <small className="muted">light {result.light.score}/100 · {result.frames} frames</small>
            </div>
            <div className="skin-traits">
              {result.traits.map((t) => (
                <div key={t.id} className="vs-bar">
                  <span>{t.label}</span>
                  <div className="bar">
                    <div style={{ width: `${Math.max(3, t.value)}%`, background: LEVEL_COLOR[t.level] }} />
                  </div>
                  <b className={`skin-level ${t.level}`}>{t.level}</b>
                </div>
              ))}
            </div>
          </div>
          )}
          {!result.light.ok ? null : advice.length ? (
            <>
              <h4 className="skin-section">What to do — based on this scan</h4>
              <div className="skin-advice-grid">
                {advice.map(([a, level, id]) => (
                  <AdviceCard key={id} a={a} level={level} />
                ))}
              </div>
            </>
          ) : (
            <p className="skin-good">✨ Nothing stands out on camera. Keep the basics: cleanse, moisturise, sunscreen, sleep and water.</p>
          )}
        </>
      )}

      <h4 className="skin-section">Follow along — guided routines with voice</h4>
      <RoutinePlayer />

      <div className="skin-more">
        <details>
          <summary>🧴 Daily skincare routine</summary>
          <dl className="skin-dl">
            {DAILY_ROUTINE.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="small muted">Try one new product at a time, and patch-test it on your inner arm for 2 days first.</p>
        </details>
        <details>
          <summary>🥗 Whole body: water, sleep, food, sun</summary>
          <dl className="skin-dl">
            {LIFESTYLE.map(([icon, k, v]) => (
              <div key={k}>
                <dt>
                  {icon} {k}
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
        <details>
          <summary>🏃 Exercise &amp; 🧘 yoga</summary>
          <dl className="skin-dl">
            {[...EXERCISE, ...YOGA].map(([k, dose, why]) => (
              <div key={k}>
                <dt>
                  {k} <span className="muted">· {dose}</span>
                </dt>
                <dd>{why}</dd>
              </div>
            ))}
          </dl>
          <p className="small muted">Stop any pose that hurts. With a medical condition, injury or pregnancy, ask your doctor first.</p>
        </details>
        <details open={findings.some((t) => t.level === "high")}>
          <summary>🩺 When to see a doctor — always</summary>
          <ul className="skin-flags">
            {SEE_A_DOCTOR.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      </div>

      <p className="skin-disclaimer small">
        A webcam shows how skin <i>looks</i> — it depends on light, camera and makeup, can't see inside the body, and can't tell skin diseases
        apart. Scores are approximate and meant for tracking your own progress. For a diagnosis or prescription medicine, see a
        dermatologist. Your video never leaves this device.
      </p>
    </section>
  );
}
