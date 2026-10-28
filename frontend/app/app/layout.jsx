import { AppShell } from "@/components/AppShell";

// The signed-in app is private: keep it out of search results.
export const metadata = { title: "App", robots: { index: false, follow: false } };

export default function AppLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
