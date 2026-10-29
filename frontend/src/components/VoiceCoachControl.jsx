import { useVoiceCoach, voiceCoach } from "@/lib/voiceCoach";

/** What the coach just said, on screen too (noisy rooms, muted speakers, hard of hearing). */
export function VoiceCaption() {
  const { on, lastText } = useVoiceCoach();
  return (
    <p className="voice-caption" aria-live="polite" hidden={!on || !lastText}>
      <span aria-hidden="true">🔊</span> {lastText}
    </p>
  );
}

/** On/off, voice and speed for the spoken coach (saved on this device). */
export function VoiceCoachControl({ greeting = "Hi! I'm your voice coach. I'll guide you while you practise." }) {
  const vc = useVoiceCoach();
  if (!vc.supported) return null;
  const current = voiceCoach.voice;

  return (
    <div className="voice-coach" role="group" aria-label="Voice coach">
      <button
        className={`btn sm ${vc.on ? "" : "ghost"}`}
        aria-pressed={vc.on}
        onClick={() => {
          voiceCoach.update({ on: !vc.on });
          if (!vc.on) voiceCoach.say("Voice coach on.");
        }}
        title="Spoken guidance: framing, posture, focus and feedback on your answers"
      >
        {vc.on ? "🔊 Voice coach on" : "🔇 Voice coach off"}
      </button>
      {vc.on && (
        <>
          <select
            aria-label="Coach voice"
            value={current?.voiceURI ?? ""}
            onChange={(e) => {
              voiceCoach.update({ voiceURI: e.target.value });
              voiceCoach.say("This is how I sound.");
            }}
          >
            {vc.voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s*-\s*English.*$/, "")} ({v.lang})
              </option>
            ))}
          </select>
          <select aria-label="Speaking speed" value={vc.rate} onChange={(e) => voiceCoach.update({ rate: +e.target.value })}>
            <option value={0.85}>Slow</option>
            <option value={1}>Normal</option>
            <option value={1.15}>Fast</option>
          </select>
          <button className="btn ghost sm" onClick={() => voiceCoach.say(greeting)}>
            ▶ Test voice
          </button>
        </>
      )}
    </div>
  );
}
