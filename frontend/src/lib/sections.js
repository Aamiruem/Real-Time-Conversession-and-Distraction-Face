// Every page of the app with its own icon and colour — used by the sidebar, the top bar and the dashboard, so a
// section looks the same everywhere. Colours are the 600 steps: white icons on them stay readable in both themes.
export const SECTIONS = {
  "/app": { icon: "dashboard", label: "Dashboard", color: "#2563eb", desc: "Your progress at a glance" },
  "/app/routine": { icon: "clock", label: "Daily Routine", color: "#0f766e", desc: "Your day: deep work, speaking, exercise, fun, sleep and namaz" },
  "/app/focus": { icon: "focus", label: "Focus Monitor", color: "#16a34a", desc: "Live focus, distraction and drowsiness" },
  "/app/speech": { icon: "mic", label: "Speech Coach", color: "#7c3aed", desc: "Confidence, pace and pronunciation" },
  "/app/conversation": { icon: "chat", label: "Conversation Coach", color: "#db2777", desc: "Fluency, tone and interaction" },
  "/app/interview": { icon: "briefcase", label: "Interview Prep", color: "#d97706", desc: "Mock interviews, any field" },
  "/app/meet": { icon: "video", label: "Meet", color: "#dc2626", desc: "HD video meetings, screen share, chat" },
  "/app/rooms": { icon: "users", label: "Focus Rooms", color: "#0d9488", desc: "Chat with live focus" },
  "/app/analytics": { icon: "chart", label: "Analytics", color: "#0284c7", desc: "History, trends and leaderboard" },
  "/app/vision": { icon: "eye", label: "Vision Studio", color: "#4f46e5", desc: "Every CV model live: objects by name, hands, pose" },
  "/app/lab": { icon: "flask", label: "AI Lab", color: "#9333ea", desc: "Try each AI model on its own" },
  "/app/settings": { icon: "settings", label: "Account settings", color: "#475569", desc: "Profile, password and data" },
};

export const NAV_GROUPS = [
  ["Home", ["/app", "/app/routine"]],
  ["Practice", ["/app/focus", "/app/speech", "/app/conversation", "/app/interview"]],
  ["Community", ["/app/meet", "/app/rooms"]],
  ["Insights", ["/app/analytics", "/app/vision", "/app/lab"]],
];
