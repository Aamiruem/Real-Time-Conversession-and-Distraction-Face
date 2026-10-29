// Vision Studio: every computer-vision model live on your camera — objects by name, fine names, scene, hands +
// gestures, body pose, face mesh + expressions, person segmentation. Runs entirely in the browser.
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHead } from "@/components/ui";
import { describe, loadVisionModels, MODELS, VisionEngine } from "@/lib/vision";
import { voiceCoach } from "@/lib/voiceCoach";

const pct = (x) => `${Math.round(x * 100)}%`;

export default function Vision() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const engine = useRef(null);
  const stream = useRef(null);
  const raf = useRef(0);
  const [status, setStatus] = useState("idle"); // idle | loading | running | error
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(() => Object.fromEntries(MODELS.map((m) => [m.id, true])));
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [s, setS] = useState(null);
  const [fps, setFps] = useState(0);
  const [said, setSaid] = useState("");

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);
  useEffect(() => stop, [stop]);

  const start = async () => {
    setError("");
    setStatus("loading");
    try {
      const [models, media] = await Promise.all([
        loadVisionModels(),
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" } }),
      ]);
      engine.current ??= new VisionEngine(models);
      stream.current = media;
      videoRef.current.srcObject = media;
      await videoRef.current.play();
      setStatus("running");
      let frames = 0,
        lastFps = performance.now(),
        lastUi = 0,
        lastTime = -1;
      const tick = () => {
        const video = videoRef.current;
        if (video?.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          engine.current.step(video, enabledRef.current);
          engine.current.draw(canvasRef.current, video, enabledRef.current);
          frames += 1;
          const now = performance.now();
          if (now - lastUi > 300) {
            lastUi = now;
            setS(engine.current.summary(enabledRef.current));
          }
          if (now - lastFps > 1000) {
            setFps(Math.round((frames * 1000) / (now - lastFps)));
            frames = 0;
            lastFps = now;
          }
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch (e) {
      setStatus("error");
      setError(e?.name === "NotAllowedError" ? "Camera permission was denied — allow it in the address bar and try again." : `Could not start: ${e?.message ?? e}`);
    }
  };

  const speak = () => {
    if (!s) return;
    const text = describe(s);
    setSaid(text);
    voiceCoach.say(text);
  };

  const snapshot = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d");
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1); // as you see it on screen
    ctx.drawImage(video, 0, 0);
    ctx.drawImage(canvasRef.current, 0, 0);
    const a = document.createElement("a");
    a.download = `vision-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  };

  const running = status === "running";
  return (
    <>
      <PageHead
        eyebrow="Computer vision · 7 AI models · runs on your device"
        title="Vision Studio"
        highlight="Vision Studio"
        sub="Everything the camera sees, identified by name — objects, hands and gestures, body pose, face and expressions, and you separated from the background. Video never leaves your device."
      />
      <div className="vs-models" role="group" aria-label="AI models">
        {MODELS.map((m) => (
          <button
            key={m.id}
            className={`vs-chip ${enabled[m.id] ? "on" : ""}`}
            style={{ "--c": m.color }}
            aria-pressed={enabled[m.id]}
            onClick={() => setEnabled((e) => ({ ...e, [m.id]: !e[m.id] }))}
          >
            {m.icon} {m.label}
            {running && enabled[m.id] && s?.ms?.[m.id] != null && <small>{s.ms[m.id]} ms</small>}
          </button>
        ))}
      </div>
      <div className="grid split-3-2">
        <div>
          <div className="card feed">
            <div className="feed-head">
              <span className={`chip ${running ? "live" : ""}`}>
                <span className="dot" /> {running ? "Live" : "Camera off"}
              </span>
              <span className="chip">{running ? `${fps} fps` : "— fps"}</span>
            </div>
            <div className="video-wrap">
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} />
              {!running && (
                <div className="placeholder">
                  {status === "loading" ? (
                    <span>
                      <span className="spinner" style={{ display: "inline-block" }} /> Loading 7 vision models (first time ~60 MB, then cached)…
                    </span>
                  ) : (
                    "Press Start and allow camera access"
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
            {running ? (
              <button className="btn danger" onClick={stop}>
                ■ Stop
              </button>
            ) : (
              <button className="btn" onClick={start} disabled={status === "loading"}>
                ▶ Start camera
              </button>
            )}
            <button className="btn ghost" onClick={speak} disabled={!running}>
              🔊 Describe what I see
            </button>
            <button className="btn ghost" onClick={snapshot} disabled={!running}>
              📸 Snapshot
            </button>
          </div>
          {said && <p className="voice-caption">🔊 {said}</p>}
          {error && <div className="alert error">{error}</div>}
        </div>

        <div className="vs-panels">
          <div className="card">
            <div className="card-title">📦 Objects in view</div>
            {!s?.objects.length ? (
              <p className="muted small">{running ? "Hold something up to the camera — a phone, cup, book, bottle, keyboard…" : "Start the camera to see objects by name."}</p>
            ) : (
              <ul className="vs-list">
                {s.objects.map((o) => (
                  <li key={o.name}>
                    <b>{o.name}</b>
                    {o.count > 1 && <span className="chip">×{o.count}</span>}
                    {o.base !== o.name && <span className="muted small">({o.base})</span>}
                    <span className="vs-score">{pct(o.score)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <div className="card-title">🖼️ Scene — top 5 of 1,000 names</div>
            {!s?.scene.length ? (
              <p className="muted small">—</p>
            ) : (
              s.scene.map((c) => (
                <div key={c.name} className="vs-bar">
                  <span>{c.name}</span>
                  <div className="bar">
                    <div style={{ width: pct(c.score), background: "#a78bfa" }} />
                  </div>
                  <b>{pct(c.score)}</b>
                </div>
              ))
            )}
          </div>
          <div className="card vs-grid2">
            <div>
              <div className="card-title">✋ Hands</div>
              {s?.hands.length ? (
                s.hands.map((h, i) => (
                  <p key={i} className="vs-line">
                    {h.side}: {h.gesture ? `${h.gesture[0]} ${h.gesture[1]} ${pct(h.score)}` : "no gesture"}
                  </p>
                ))
              ) : (
                <p className="muted small">Try 👍 ✌️ ✋ ☝️ ✊ 🤟</p>
              )}
            </div>
            <div>
              <div className="card-title">🙂 Face</div>
              {s?.faces ? (
                (s.expressions[0]?.length ? s.expressions[0] : [{ label: "Neutral", score: 1 }]).slice(0, 3).map((e) => (
                  <p key={e.label} className="vs-line">
                    {e.label} <span className="muted">{pct(e.score)}</span>
                  </p>
                ))
              ) : (
                <p className="muted small">No face</p>
              )}
            </div>
            <div>
              <div className="card-title">🧍 Body</div>
              <p className="vs-line">{s?.people ? `${s.people} ${s.people > 1 ? "people" : "person"} · 33 points each` : "—"}</p>
            </div>
            <div>
              <div className="card-title">✂️ Segmentation</div>
              <p className="vs-line">{s?.personShare != null ? `You fill ${pct(s.personShare)} of the frame` : "—"}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
