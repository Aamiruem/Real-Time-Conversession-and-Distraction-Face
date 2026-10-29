import { lazy, Suspense, useEffect } from "react";
import { Outlet, Route, Routes, useLocation, useParams } from "react-router";
import { AppShell } from "@/components/AppShell";
import { SeoSync } from "@/components/Seo";
import { AuthProvider } from "@/lib/auth";
import Feature from "./pages/Feature";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Signup from "./pages/Signup";
import Loading from "./pages/app/Loading";

// Public pages load with the first bundle (and are pre-rendered for SEO); each private app page is its own
// chunk, downloaded only when needed — so the landing page stays small and fast. Once the app is open, the other
// pages are fetched in the background while the browser is idle, so switching pages is instant (no loading flash).
const PAGES = {
  Dashboard: () => import("./pages/app/Dashboard"),
  Focus: () => import("./pages/app/Focus"),
  Speech: () => import("./pages/app/Speech"),
  Conversation: () => import("./pages/app/Conversation"),
  Interview: () => import("./pages/app/Interview"),
  Rooms: () => import("./pages/app/Rooms"),
  Meet: () => import("./pages/app/Meet"),
  Vision: () => import("./pages/app/Vision"),
  Analytics: () => import("./pages/app/Analytics"),
  Lab: () => import("./pages/app/Lab"),
  Settings: () => import("./pages/app/Settings"),
  MeetLink: () => import("./pages/app/MeetLink"),
};
const Dashboard = lazy(PAGES.Dashboard);
const Focus = lazy(PAGES.Focus);
const Speech = lazy(PAGES.Speech);
const Conversation = lazy(PAGES.Conversation);
const Interview = lazy(PAGES.Interview);
const Rooms = lazy(PAGES.Rooms);
const Meet = lazy(PAGES.Meet);
const Vision = lazy(PAGES.Vision);
const Analytics = lazy(PAGES.Analytics);
const Lab = lazy(PAGES.Lab);
const Settings = lazy(PAGES.Settings);
const MeetLink = lazy(PAGES.MeetLink);

function usePrefetchPages() {
  useEffect(() => {
    if (navigator.connection?.saveData) return; // respect data saver
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    const id = idle(() => Object.values(PAGES).forEach((load) => load().catch(() => {})));
    return () => cancel(id);
  }, []);
}

function AppLayout() {
  usePrefetchPages();
  return (
    <AppShell>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

/** <site>/abc-defg-hij is a meeting link (like Meet's); any other unknown path is still a 404. */
function MeetingOr404() {
  const { code = "" } = useParams();
  if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code)) return <NotFound />;
  return (
    <Suspense fallback={<Loading />}>
      <MeetLink code={code} />
    </Suspense>
  );
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <SeoSync />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/features/:slug" element={<Feature />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="focus" element={<Focus />} />
          <Route path="speech" element={<Speech />} />
          <Route path="conversation" element={<Conversation />} />
          <Route path="interview" element={<Interview />} />
          <Route path="meet" element={<Meet />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="vision" element={<Vision />} />
          <Route path="lab" element={<Lab />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="/:code" element={<MeetingOr404 />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
