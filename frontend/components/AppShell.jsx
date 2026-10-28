"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "./SiteChrome";

const NAV = [
  ["/app", "🏠", "Dashboard"],
  ["/app/focus", "🎥", "Focus Monitor"],
  ["/app/speech", "🗣️", "Speech Coach"],
  ["/app/rooms", "💬", "Focus Rooms"],
  ["/app/analytics", "📊", "Analytics"],
  ["/app/lab", "🧪", "AI Lab"],
];

export function AppShell({ children }) {
  const { user, ready, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, user, path, router]);

  if (!ready || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="brand" style={{ padding: "4px 10px 14px" }}>
          <Logo /> FocusLink AI
        </Link>
        {NAV.map(([href, icon, label]) => (
          <Link key={href} href={href} className={`nav-item ${path === href ? "on" : ""}`}>
            {icon} {label}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <div className="card" style={{ padding: 12 }}>
          <b>{user.full_name || user.username}</b>
          <div className="small muted" style={{ wordBreak: "break-all" }}>
            @{user.username} · {user.email}
          </div>
        </div>
        <button
          className="btn ghost sm"
          onClick={() => {
            signOut();
            router.replace("/login");
          }}
        >
          Log out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
