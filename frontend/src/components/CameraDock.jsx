import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CameraRecorder } from "@/lib/cameraRecorder";
import { canRecord } from "@/lib/meetRecorder";
import { downloadBlob, saveRecording } from "@/lib/recordings";
import { Icon } from "./Icons";

const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Player controls on a camera (the .video-wrap right before it), like a video player: Record — the picture with its
 * overlay plus the microphone, saved to the user's account for checking results later — and the view size: mini,
 * default or full screen. They show on hover (always on touch screens, while recording and in full screen).
 *   running   the camera is on (Record needs it)
 *   source    which section recorded it (focus, speech, interview…), shown in the recordings list
 *   metrics   optional live {focusPct, state}: adds a focus read-out and a focus timeline to the recording
 */
export function CameraDock({ running, source, title, metrics = null }) {
  const box = useRef(null);
  const [size, setSize] = useState("mid");
  const [secs, setSecs] = useState(null); // null = not recording
  const [status, setStatus] = useState("");
  const rec = useRef(null);
  const mic = useRef(null); // a microphone this dock opened itself (closed again after recording)
  const latest = useRef(metrics); // the recorder samples this while recording
  latest.current = metrics;

  const wrap = () => box.current?.previousElementSibling;
  const [host, setHost] = useState(null); // the camera box the controls are drawn into
  useEffect(() => setHost(wrap() ?? null), []);

  // size: a data attribute on the camera box; Full = the browser's fullscreen (Esc goes back to Mid)
  useEffect(() => {
    const w = wrap();
    if (!w) return;
    w.dataset.size = size === "full" ? "mid" : size;
    if (size === "full") w.requestFullscreen?.().catch(() => setSize("mid"));
    else if (document.fullscreenElement === w) document.exitFullscreen().catch(() => {});
  }, [size]);
  useEffect(() => {
    const onChange = () => !document.fullscreenElement && setSize((s) => (s === "full" ? "mid" : s));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function start() {
    const w = wrap();
    const video = w?.querySelector("video");
    if (!video?.videoWidth) return setStatus("Start the camera first");
    let audio = video.srcObject?.getAudioTracks().length ? video.srcObject : null;
    if (!audio) {
      try {
        audio = mic.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        audio = null; // no mic permission: video only
      }
    }
    try {
      const r = new CameraRecorder(video, w.querySelector("canvas"), metrics ? () => latest.current : null, "medium", audio);
      r.start();
      rec.current = r;
      setSecs(0);
      setStatus(audio ? "" : "Recording without sound (microphone not allowed)");
    } catch (e) {
      setStatus(`Could not record: ${e.message}`);
    }
  }

  async function stop() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setSecs(null);
    const { blob, durationSec, timeline } = await r.stop();
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    const name = `${title} ${new Date().toLocaleString()}`;
    setStatus("Saving…");
    try {
      const saved = await saveRecording(blob, { title: name, source, durationSec, timeline });
      setStatus(`✅ Saved (${(saved.size_bytes / 1e6).toFixed(1)} MB) — see "My recordings" in Focus Rooms`);
    } catch (e) {
      downloadBlob(blob, name);
      setStatus(`Downloaded to this device instead (${e.message})`);
    }
  }

  // running clock; stop + save when the camera turns off or the page closes
  const recording = secs !== null;
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSecs(rec.current?.seconds ?? 0), 500);
    return () => clearInterval(t);
  }, [recording]);
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    if (!running && rec.current) stopRef.current();
  }, [running]);
  useEffect(() => () => void stopRef.current(), []);

  const views = [
    ["small", "viewSmall", "Mini view"],
    ["mid", "viewMid", "Default view"],
  ];
  const controls = (running || recording) && (
    <div className={`vid-controls ${recording || size === "full" ? "pinned" : ""}`}>
      <div className="vid-group">
        {recording ? (
          <button type="button" className="vid-btn rec live" onClick={stop} title="Stop and save the recording" aria-label="Stop and save the recording">
            <span className="stop-square" />
          </button>
        ) : (
          <button
            type="button"
            className="vid-btn rec"
            onClick={start}
            disabled={!canRecord()}
            title={canRecord() ? "Record video + audio" : "Recording needs Chrome, Edge or Firefox"}
            aria-label="Record video and audio"
          >
            <span className="rec-dot" />
          </button>
        )}
        {recording && (
          <span className="vid-time">
            <span className="rec-dot" /> REC {clock(secs)}
          </span>
        )}
      </div>
      <div className="vid-group">
        {views.map(([k, icon, label]) => (
          <button
            key={k}
            type="button"
            className={`vid-btn ${size === k ? "on" : ""}`}
            onClick={() => setSize(k)}
            title={label}
            aria-label={label}
            aria-pressed={size === k}
          >
            <Icon name={icon} size={20} />
          </button>
        ))}
        <button
          type="button"
          className={`vid-btn ${size === "full" ? "on" : ""}`}
          onClick={() => setSize(size === "full" ? "mid" : "full")}
          title={size === "full" ? "Exit full screen (Esc)" : "Full screen"}
          aria-label={size === "full" ? "Exit full screen" : "Full screen"}
        >
          <Icon name={size === "full" ? "exitFull" : "fullscreen"} size={20} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="cam-dock-anchor" ref={box}>
      {host && controls && createPortal(controls, host)}
      {status && <p className="small muted cam-dock-status">{status}</p>}
    </div>
  );
}
