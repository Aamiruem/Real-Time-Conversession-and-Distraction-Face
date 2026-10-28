import { useRouter } from "@/lib/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

// Every page and the most useful actions, searchable from anywhere with Ctrl/⌘+K.
const COMMANDS = [
  ["🏠", "Dashboard", "/app", "home overview stats goals"],
  ["🎥", "Start a focus session", "/app/focus", "focus monitor camera attention drowsy"],
  ["🗣️", "Speech Coach", "/app/speech", "speech confidence pronunciation record"],
  ["🗨️", "Conversation Coach", "/app/conversation", "conversation fluency tone interaction modulation"],
  ["💼", "Mock interview", "/app/interview", "interview practice record answer"],
  ["📘", "Interview prep guide", "/app/interview?tab=guide", "dress posture eye contact first impression how to get interview"],
  ["❓", "Interview question bank", "/app/interview?tab=bank", "questions star answers"],
  ["📖", "Vocabulary & voice tips", "/app/interview?tab=vocab", "words swaps power verbs tone"],
  ["💬", "Focus Rooms", "/app/rooms", "chat room messages"],
  ["📊", "Analytics", "/app/analytics", "history leaderboard progress"],
  ["🧪", "AI Lab", "/app/lab", "nlp ml model computer vision"],
  ["⚙️", "Account settings", "/app/settings", "profile name password delete account"],
  ["🌐", "Website home", "/", "landing seo features"],
];

export function CommandPalette({ open, onClose, onLogout }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef(null);

  const items = useMemo(() => {
    const all = [["✨", "Ask the AI coach", "coach", "assistant help question advice recommend"], ...COMMANDS,
      ["🚪", "Log out", "logout", "sign out exit"]];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(([, label, , kw]) => words.every((w) => `${label} ${kw}`.toLowerCase().includes(w)));
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;
  const go = (item) => {
    onClose();
    if (!item) return;
    if (item[2] === "logout") return onLogout();
    if (item[2] === "coach") return window.dispatchEvent(new CustomEvent("presence:coach"));
    router.push(item[2]);
    // pages that are already open react to the section in the link (e.g. ?tab=bank)
    const tab = new URL(item[2], window.location.origin).searchParams.get("tab");
    window.dispatchEvent(new CustomEvent("presence:tab", { detail: tab ?? "mock" }));
  };
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          placeholder="Search pages and actions…"
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setI((v) => Math.min(v + 1, items.length - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setI((v) => Math.max(v - 1, 0)));
            if (e.key === "Enter") go(items[i]);
            if (e.key === "Escape") onClose();
          }}
        />
        <ul>
          {items.map((it, n) => (
            <li key={it[1]}>
              <button className={n === i ? "on" : ""} onMouseEnter={() => setI(n)} onClick={() => go(it)}>
                <span>{it[0]}</span>
                {it[1]}
              </button>
            </li>
          ))}
          {!items.length && <li className="muted small" style={{ padding: 12 }}>No matches</li>}
        </ul>
        <div className="palette-foot small muted">
          <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
