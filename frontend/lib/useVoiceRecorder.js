"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const pickMime = () =>
  ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ??
  "";

const MIC = { echoCancellation: true, noiseSuppression: true, autoGainControl: false };

/**
 * Records the microphone with a live level meter and timer.
 * begin(stream?) records the audio tracks of `stream` (e.g. the camera stream) or opens the mic itself;
 * finish() resolves to { blob, seconds, filename, url }.
 */
export function useVoiceRecorder() {
  const [level, setLevel] = useState(-90);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef(null);
  const chunks = useRef([]);
  const meter = useRef(null);
  const ownStream = useRef(null);
  const t0 = useRef(0);

  const cleanup = useCallback(() => {
    if (meter.current) {
      clearInterval(meter.current.timer);
      meter.current.ctx.close();
      meter.current = null;
    }
    ownStream.current?.getTracks().forEach((t) => t.stop());
    ownStream.current = null;
  }, []);

  const begin = useCallback(
    async (stream) => {
      setError("");
      try {
        let source = stream;
        if (!source?.getAudioTracks().length) {
          source = ownStream.current = await navigator.mediaDevices.getUserMedia({ audio: MIC });
        }
        const audio = new MediaStream(source.getAudioTracks());
        chunks.current = [];
        const r = new MediaRecorder(audio, { mimeType: pickMime() || undefined });
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.start(1000);
        rec.current = r;
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(audio).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        t0.current = Date.now();
        setSeconds(0);
        const timer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((a, b) => a + b * b, 0) / buf.length);
          setLevel(20 * Math.log10(rms + 1e-9));
          setSeconds((Date.now() - t0.current) / 1000);
        }, 150);
        meter.current = { ctx, timer };
        setRecording(true);
        return true;
      } catch (e) {
        cleanup();
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Microphone permission was denied. Allow it in the address bar and try again."
            : `Could not start recording: ${e instanceof Error ? e.message : e}`,
        );
        return false;
      }
    },
    [cleanup],
  );

  const finish = useCallback(async () => {
    const r = rec.current;
    if (!r) return null;
    const done = new Promise((res) => (r.onstop = res));
    r.stop();
    await done;
    rec.current = null;
    cleanup();
    setRecording(false);
    const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    return { blob, seconds: (Date.now() - t0.current) / 1000, filename: `speech.${ext}`, url: URL.createObjectURL(blob) };
  }, [cleanup]);

  useEffect(
    () => () => {
      if (rec.current?.state === "recording") rec.current.stop();
      cleanup();
    },
    [cleanup],
  );

  return { level, seconds, recording, error, begin, finish };
}

/** Mic level (dB) as a 0-100 meter value. */
export const levelPct = (db) => Math.max(0, Math.min(100, ((db + 60) / 50) * 100));
