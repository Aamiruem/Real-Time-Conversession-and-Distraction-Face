import { useCallback, useEffect, useRef, useState } from "react";

// Voice commands: the browser's speech recognition turns speech into text, then a small intent matcher
// (keyword phrases + synonyms, best match wins) maps it to an action. Chrome/Edge send the audio to their
// speech service; Firefox has no speech recognition, so the hook reports `supported: false` there.

/** Intent name -> trigger phrases. Longer, more specific phrases win over short ones. */
export const INTENTS = {
  record: ["start recording", "start answer", "record answer", "begin answer", "record", "start", "begin"],
  stop: ["stop recording", "stop answer", "finish answer", "end answer", "i'm done", "i am done", "stop", "finish", "done"],
  next: ["next question", "another question", "skip question", "next one", "skip", "next"],
  hints: ["show hints", "show hint", "give me a hint", "help me", "hints", "hint"],
  hideHints: ["hide hints", "hide hint", "close hints"],
  camera: ["camera check", "start camera", "camera on", "turn on camera", "open camera"],
  cameraOff: ["camera off", "stop camera", "turn off camera", "close camera"],
  mock: ["mock interview", "practice", "practise", "mock"],
  guide: ["prep guide", "preparation guide", "open guide", "guide"],
  bank: ["question bank", "all questions", "questions"],
  vocab: ["vocabulary", "voice tips", "word swaps", "words"],
};
// While an answer is being recorded only an explicit stop phrase counts — normal answers contain "stop" or "done"
const RECORDING_SAFE = ["stop recording", "stop answer", "finish answer", "end answer"];

export function matchIntent(text, recording = false) {
  const t = ` ${text.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ")} `;
  if (recording) return RECORDING_SAFE.some((p) => t.includes(` ${p} `)) ? "stop" : null;
  let best = null,
    bestLen = 0;
  for (const [intent, phrases] of Object.entries(INTENTS)) {
    for (const p of phrases) {
      if (t.includes(` ${p} `) && p.length > bestLen) {
        best = intent;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/** Listen continuously while `enabled`; calls onCommand(intent, transcript). */
export function useVoiceCommands(onCommand, { recording = false } = {}) {
  const [enabled, setEnabled] = useState(false);
  const [heard, setHeard] = useState("");
  const [supported, setSupported] = useState(true);
  const rec = useRef(null);
  const handler = useRef(onCommand);
  const recordingRef = useRef(recording);
  handler.current = onCommand;
  recordingRef.current = recording;

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const text = e.results[e.results.length - 1][0].transcript.trim();
      const intent = matchIntent(text, recordingRef.current);
      setHeard(intent ? `“${text}” → ${intent}` : `“${text}”`);
      if (intent) handler.current(intent, text);
    };
    let stopped = false;
    r.onend = () => !stopped && r.start(); // keep listening (browsers stop after silence)
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopped = true;
        setEnabled(false);
        setHeard("Microphone permission for voice commands was denied.");
      }
    };
    r.start();
    rec.current = r;
    return () => {
      stopped = true;
      r.stop();
    };
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);
  return { enabled, toggle, heard, supported };
}
