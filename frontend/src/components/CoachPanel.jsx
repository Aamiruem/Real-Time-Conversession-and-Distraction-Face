import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const STARTERS = ["How am I doing this week?", "What should I practise next?", "How do I answer “Tell me about yourself”?",
  "How do I stop saying “um”?"];

/** Opens the coach from anywhere: window.dispatchEvent(new CustomEvent("presence:coach", { detail: "question?" })) */
export const openCoach = (question) => window.dispatchEvent(new CustomEvent("presence:coach", { detail: question }));

/** Slide-in AI coach chat: answers about your progress, interviews, speaking and focus. */
export function CoachPanel() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState([]); // {role, content, engine?}
  const [followUps, setFollowUps] = useState(STARTERS);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    setErr("");
    setText("");
    const history = turnsRef.current.map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await api("/coach/ask", { method: "POST", json: { question: q, history } });
      setTurns((t) => [...t, { role: "assistant", content: r.answer, engine: r.engine }]);
      setFollowUps(r.follow_ups);
    } catch (e) {
      setErr(e.status === 404 ? "The AI coach needs the updated backend — restart it to use the coach." : e.message);
    } finally {
      setBusy(false);
    }
  }
  const askRef = useRef(ask);
  askRef.current = ask;

  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      if (typeof e.detail === "string" && e.detail) askRef.current(e.detail);
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("presence:coach", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("presence:coach", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  if (!open) return null;
  return (
    <aside className="coach" role="dialog" aria-label="AI coach">
      <header className="coach-head">
        <div>
          <b>✨ AI Coach</b>
          <span className="small muted">Answers from your own data and the interview guide</span>
        </div>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close coach">
          ✕
        </button>
      </header>
      <div className="coach-list" ref={listRef}>
        {!turns.length && (
          <div className="coach-empty">
            <span>🧭</span>
            <p>Ask about your progress, what to practise next, or how to handle any interview question.</p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>
            {t.content.split("\n").map((line, j) => (
              <p key={j}>{line}</p>
            ))}
            {t.engine && <span className="engine">{t.engine === "claude" ? "Claude" : "Built-in coach"}</span>}
          </div>
        ))}
        {busy && (
          <div className="bubble assistant typing" aria-label="Coach is typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {err && <div className="alert error">{err}</div>}
      </div>
      <div className="coach-suggest">
        {followUps.map((q) => (
          <button key={q} onClick={() => ask(q)} disabled={busy}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="coach-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask your coach…" maxLength={500} />
        <button className="btn sm" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
