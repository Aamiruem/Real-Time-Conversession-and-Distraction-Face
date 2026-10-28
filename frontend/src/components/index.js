// Every shared component in one place: `import { AppShell, Gauge, InterviewFeedback } from "@/components"`.
// Marketing pages (src/app/page.jsx, features/…) import their few components directly instead, so their
// JavaScript stays small and the public, SEO-indexed pages load fast.

export { AppShell } from "./AppShell";
export { LoginForm, SignupForm } from "./AuthForms";
export { AuthLayout } from "./AuthLayout";
export { CommandPalette } from "./CommandPalette";
export { ConversationFeedback } from "./ConversationFeedback";
export { ChartCard, EmptyChart, GoalRing, GRID, Kpi, SERIES, TICK, TOOLTIP, timeAgo } from "./dashboard";
export { InterviewFeedback } from "./InterviewFeedback";
export { Logo, SiteFooter, SiteHeader } from "./SiteChrome";
export { Bars, Donut, Gauge, Metric, PageHead, RiskCard, SpeechResult, StateBadge } from "./ui";
