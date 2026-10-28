import { lazy, Suspense, useEffect } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router";
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
// chunk, downloaded only when you open it — so the landing page stays small and fast.
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Focus = lazy(() => import("./pages/app/Focus"));
const Speech = lazy(() => import("./pages/app/Speech"));
const Conversation = lazy(() => import("./pages/app/Conversation"));
const Interview = lazy(() => import("./pages/app/Interview"));
const Rooms = lazy(() => import("./pages/app/Rooms"));
const Analytics = lazy(() => import("./pages/app/Analytics"));
const Lab = lazy(() => import("./pages/app/Lab"));
const Settings = lazy(() => import("./pages/app/Settings"));

function AppLayout() {
  return (
    <AppShell>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </AppShell>
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
          <Route path="rooms" element={<Rooms />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="lab" element={<Lab />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
