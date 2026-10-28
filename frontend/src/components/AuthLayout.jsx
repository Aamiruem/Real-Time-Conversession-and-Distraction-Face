import { SiteHeader } from "./SiteChrome";

export function AuthLayout({ children }) {
  return (
    <>
      <SiteHeader />
      <main className="container auth">
        <section>
          <span className="pill">Computer vision · NLP · Speech AI · Machine learning</span>
          <h1>
            Stay focused.
            <br />
            <span className="grad">Speak with confidence.</span>
          </h1>
          <p className="lead" style={{ margin: 0 }}>
            Real-time distraction &amp; drowsiness detection, an AI speech coach, fatigue prediction and focus-aware
            conversations — in one place.
          </p>
          <ul>
            <li>🎥 Live focus %, blink rate, yawns, head pose &amp; gaze — video never leaves your device</li>
            <li>🗣️ Pronunciation, pace, filler words &amp; confidence coaching</li>
            <li>🧠 Machine-learning fatigue risk that learns from you</li>
            <li>💬 Chat rooms with live focus, sentiment &amp; confidence analysis</li>
          </ul>
        </section>
        <section className="card" style={{ padding: 28 }}>
          {children}
        </section>
      </main>
    </>
  );
}
