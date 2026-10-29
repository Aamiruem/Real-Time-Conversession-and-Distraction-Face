// A video-style player for the guided routines: animated illustration, spoken + captioned steps, a timeline you can
// scrub, chapters with thumbnails, and the usual controls (play/pause, next, voice, captions, speed, theatre, full screen).
// Keys: Space play/pause · → next step · ← previous · C captions · M voice · F full screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime, ROUTINES } from "@/lib/routines";
import { voiceCoach } from "@/lib/voiceCoach";
import { Icon } from "./Icons";
import { StepArt } from "./RoutineArt";

const SPEEDS = [
  ["Short (½ time)", 0.5],
  ["Normal", 1],
  ["Long (1½× time)", 1.5],
];

export function RoutinePlayer() {
  const [routineId, setRoutineId] = useState(ROUTINES[0].id);
  const routine = ROUTINES.find((r) => r.id === routineId);
  const [scale, setScale] = useState(1); // step length multiplier
  const [elapsed, setElapsed] = useState(0); // seconds into the routine
  const [playing, setPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [cc, setCc] = useState(true);
  const [wide, setWide] = useState(false);
  const [menu, setMenu] = useState(false);
  const box = useRef(null);
  const raf = useRef(0);
  const spoken = useRef(-1);

  const durations = routine.steps.map((s) => s.secs * scale);
  const total = durations.reduce((a, d) => a + d, 0);
  const starts = durations.map((_, i) => durations.slice(0, i).reduce((a, d) => a + d, 0));
  const idx = Math.max(0, starts.findLastIndex((s) => s <= elapsed));
  const step = routine.steps[idx];
  const inStep = elapsed - starts[idx];
  const phase = (inStep / step.period) % 1;
  const blend = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
  const done = elapsed >= total;

  // the clock
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setElapsed((e) => Math.min(total, e + dt));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, total]);

  // speak each step as it starts; stop at the end
  useEffect(() => {
    if (done && playing) {
      setPlaying(false);
      if (voiceOn) voiceCoach.say(`Well done — ${routine.title} complete.`);
      return;
    }
    if (!playing || spoken.current === idx) return;
    spoken.current = idx;
    if (voiceOn) voiceCoach.say(`${step.title}. ${step.how}`, 20000);
  }, [idx, playing, done, voiceOn, step, routine.title]);

  const seek = useCallback(
    (sec) => {
      setElapsed(Math.max(0, Math.min(total - 0.01, sec)));
      spoken.current = -1; // say the step we land on
    },
    [total],
  );
  const toggle = useCallback(() => {
    if (done) seek(0);
    setPlaying((p) => !p);
    if (playing) window.speechSynthesis?.cancel();
  }, [done, playing, seek]);
  const goStep = useCallback((i) => seek(starts[Math.max(0, Math.min(routine.steps.length - 1, i))] ?? 0), [seek, starts, routine.steps.length]);
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())?.catch?.(() => {});

  const choose = (id) => {
    setRoutineId(id);
    setPlaying(false);
    setElapsed(0);
    spoken.current = -1;
    window.speechSynthesis?.cancel();
  };

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const onKey = (e) => {
    const k = e.key.toLowerCase();
    const actions = { " ": toggle, arrowright: () => goStep(idx + 1), arrowleft: () => goStep(inStep > 2 ? idx : idx - 1), c: () => setCc((v) => !v), m: () => setVoiceOn((v) => !v), f: fullscreen };
    if (actions[k]) {
      e.preventDefault();
      actions[k]();
    }
  };

  return (
    <div className="routines" style={{ "--rc": routine.color }}>
      <div className="routine-tabs" role="tablist" aria-label="Guided routines">
        {ROUTINES.map((r) => (
          <button key={r.id} role="tab" aria-selected={r.id === routineId} className={r.id === routineId ? "on" : ""} style={{ "--rc": r.color }} onClick={() => choose(r.id)}>
            <b>{r.title}</b>
            <small>{r.sub}</small>
          </button>
        ))}
      </div>

      <div className={`routine-layout ${wide ? "wide" : ""}`}>
        <div ref={box} className="rp" tabIndex={0} onKeyDown={onKey} aria-label={`${routine.title} player`}>
          <div className="rp-top">
            <button className="rp-btn" onClick={() => goStep(inStep > 2 ? idx : idx - 1)} aria-label="Previous step" title="Previous step (←)">
              <Icon name="back" size={20} />
            </button>
            <div className="rp-title">
              <b>{routine.title}</b>
              <span>
                Step {idx + 1} of {routine.steps.length} · {step.title}
              </span>
            </div>
            <button className="rp-btn" onClick={() => choose(routine.id)} aria-label="Stop and reset" title="Stop">
              <Icon name="close" size={20} />
            </button>
          </div>

          <div className="rp-stage" onClick={toggle}>
            <StepArt step={step} t={phase} p={playing ? blend : 0} color={routine.color} />
            {(!playing || done) && (
              <button className="rp-big" aria-label={done ? "Replay" : "Play"} onClick={(e) => (e.stopPropagation(), toggle())}>
                <Icon name="play" size={34} />
              </button>
            )}
            {playing && <span className="rp-count">{Math.ceil(durations[idx] - inStep)}s</span>}
            {cc && (playing || elapsed > 0) && !done && <p className="rp-cc">{step.how}</p>}
            {done && <p className="rp-cc">✓ {routine.title} complete — nice work.</p>}
          </div>

          <div className="rp-bar">
            <div
              className="rp-track"
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(total)}
              aria-valuenow={Math.round(elapsed)}
              tabIndex={-1}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - r.left) / r.width) * total);
              }}
            >
              <div className="rp-buffer" style={{ width: `${((starts[idx] + durations[idx]) / total) * 100}%` }} />
              <div className="rp-played" style={{ width: `${(elapsed / total) * 100}%` }} />
              {starts.slice(1).map((s) => (
                <i key={s} className="rp-tick" style={{ left: `${(s / total) * 100}%` }} />
              ))}
              <span className="rp-knob" style={{ left: `${(elapsed / total) * 100}%` }} />
            </div>
            <div className="rp-controls">
              <button className="rp-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"} title="Play / pause (Space)">
                <Icon name={playing ? "pause" : "play"} size={20} />
              </button>
              <button className="rp-btn" onClick={() => goStep(idx + 1)} aria-label="Next step" title="Next step (→)" disabled={idx === routine.steps.length - 1}>
                <Icon name="next" size={20} />
              </button>
              <button className="rp-btn" onClick={() => setVoiceOn((v) => !v)} aria-label={voiceOn ? "Turn voice off" : "Turn voice on"} title="Voice guide (M)" aria-pressed={voiceOn}>
                <Icon name={voiceOn ? "volume" : "mute"} size={20} />
              </button>
              <span className="rp-time">
                {fmtTime(elapsed)} / {fmtTime(total)}
              </span>
              <span className="rp-spacer" />
              <button className={`rp-btn ${cc ? "on" : ""}`} onClick={() => setCc((v) => !v)} aria-label="Captions" aria-pressed={cc} title="Captions (C)">
                <Icon name="captions" size={20} />
              </button>
              <div className="rp-menu-wrap">
                <button className="rp-btn" onClick={() => setMenu((v) => !v)} aria-label="Settings" aria-expanded={menu} title="Step length">
                  <Icon name="settings" size={19} />
                </button>
                {menu && (
                  <div className="rp-menu" role="menu">
                    <span>Step length</span>
                    {SPEEDS.map(([label, v]) => (
                      <button
                        key={v}
                        role="menuitemradio"
                        aria-checked={scale === v}
                        className={scale === v ? "on" : ""}
                        onClick={() => {
                          setElapsed((e) => (e / scale) * v);
                          setScale(v);
                          setMenu(false);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className={`rp-btn ${wide ? "on" : ""}`} onClick={() => setWide((v) => !v)} aria-label="Theatre mode" aria-pressed={wide} title="Theatre mode">
                <Icon name="theater" size={20} />
              </button>
              <button className="rp-btn" onClick={fullscreen} aria-label="Full screen" title="Full screen (F)">
                <Icon name="fullscreen" size={20} />
              </button>
            </div>
          </div>
        </div>

        <ol className="rp-chapters" aria-label="Steps">
          {routine.steps.map((s, i) => (
            <li key={s.title + i} className={i === idx ? "on" : i < idx ? "done" : ""}>
              <button onClick={() => goStep(i)}>
                <span className="rp-thumb">
                  <StepArt step={s} t={0.25} p={0.5} color={routine.color} />
                  <small>{fmtTime(s.secs * scale)}</small>
                </span>
                <span className="rp-ch-text">
                  <b>
                    {i + 1}. {s.title}
                  </b>
                  <span>{s.how}</span>
                </span>
              </button>
              <a href={s.demo} target="_blank" rel="noreferrer" className="rp-demo" title="Watch real demonstrations on YouTube">
                <Icon name="external" size={13} /> Real demo videos
              </a>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
