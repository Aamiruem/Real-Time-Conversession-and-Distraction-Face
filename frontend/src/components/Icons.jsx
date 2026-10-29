// One consistent line-icon set for the app (24×24, 2px round strokes, currentColor) — replaces emoji in the chrome,
// so icons look the same on every OS and stay crisp in light and dark mode. Paths follow the Lucide icon style.
const P = (d) => <path d={d} />;

const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  focus: (
    <>
      {P("M3 7V5a2 2 0 0 1 2-2h2")}
      {P("M17 3h2a2 2 0 0 1 2 2v2")}
      {P("M21 17v2a2 2 0 0 1-2 2h-2")}
      {P("M7 21H5a2 2 0 0 1-2-2v-2")}
      {P("M18.9 12.3a1 1 0 0 0 0-.6 7.5 7.5 0 0 0-13.8 0 1 1 0 0 0 0 .6 7.5 7.5 0 0 0 13.8 0")}
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      {P("M19 10v2a7 7 0 0 1-14 0v-2")}
      {P("M12 19v3")}
    </>
  ),
  chat: (
    <>
      {P("M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z")}
      {P("M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1")}
    </>
  ),
  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      {P("M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16")}
    </>
  ),
  video: (
    <>
      {P("m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5")}
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </>
  ),
  users: (
    <>
      {P("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2")}
      <circle cx="9" cy="7" r="4" />
      {P("M22 21v-2a4 4 0 0 0-3-3.9")}
      {P("M16 3.1a4 4 0 0 1 0 7.8")}
    </>
  ),
  chart: (
    <>
      {P("M3 3v18h18")}
      {P("M18 17V9")}
      {P("M13 17V5")}
      {P("M8 17v-3")}
    </>
  ),
  eye: (
    <>
      {P("M2.1 12.3a1 1 0 0 1 0-.7 10.8 10.8 0 0 1 19.8 0 1 1 0 0 1 0 .7 10.8 10.8 0 0 1-19.8 0")}
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  flask: (
    <>
      {P("M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5l-5.1-10.1a2 2 0 0 1-.2-.9V2")}
      {P("M8.5 2h7")}
      {P("M7 16h10")}
    </>
  ),
  settings: (
    <>
      {P("M4 21v-7")}
      {P("M4 10V3")}
      {P("M12 21v-9")}
      {P("M12 8V3")}
      {P("M20 21v-5")}
      {P("M20 12V3")}
      {P("M2 14h4")}
      {P("M10 8h4")}
      {P("M18 16h4")}
    </>
  ),
  sparkles: (
    <>
      {P("M9.9 15.5a2 2 0 0 0-1.4-1.4l-6.1-1.6a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z")}
      {P("M20 3v4")}
      {P("M22 5h-4")}
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      {P("m21 21-4.3-4.3")}
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      {P("M12 2v2")}
      {P("M12 20v2")}
      {P("m4.9 4.9 1.4 1.4")}
      {P("m17.7 17.7 1.4 1.4")}
      {P("M2 12h2")}
      {P("M20 12h2")}
      {P("m6.3 17.7-1.4 1.4")}
      {P("m19.1 4.9-1.4 1.4")}
    </>
  ),
  moon: P("M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  timer: (
    <>
      {P("M10 2h4")}
      {P("m12 14 3-3")}
      <circle cx="12" cy="14" r="8" />
    </>
  ),
  flame: P(
    "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  ),
  trophy: (
    <>
      {P("M6 9H4.5a2.5 2.5 0 0 1 0-5H6")}
      {P("M18 9h1.5a2.5 2.5 0 0 0 0-5H18")}
      {P("M4 22h16")}
      {P("M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22")}
      {P("M14 14.7V17c0 .6.5 1 1 1.2 1.1.5 2 2 2 3.8")}
      {P("M18 2H6v7a6 6 0 0 0 12 0V2Z")}
    </>
  ),
  play: P("M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"),
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  next: (
    <>
      {P("M5 4.5v15a.8.8 0 0 0 1.2.7L17 13a1.2 1.2 0 0 0 0-2L6.2 3.8a.8.8 0 0 0-1.2.7z")}
      {P("M20 4v16")}
    </>
  ),
  prev: (
    <>
      {P("M19 4.5v15a.8.8 0 0 1-1.2.7L7 13a1.2 1.2 0 0 1 0-2l10.8-7.2a.8.8 0 0 1 1.2.7z")}
      {P("M4 4v16")}
    </>
  ),
  volume: (
    <>
      {P("M11 5 6 9H2v6h4l5 4V5z")}
      {P("M15.5 8.5a5 5 0 0 1 0 7")}
      {P("M19 5a10 10 0 0 1 0 14")}
    </>
  ),
  mute: (
    <>
      {P("M11 5 6 9H2v6h4l5 4V5z")}
      {P("m22 9-6 6")}
      {P("m16 9 6 6")}
    </>
  ),
  captions: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      {P("M10 10.5a2 2 0 1 0 0 3")}
      {P("M17 10.5a2 2 0 1 0 0 3")}
    </>
  ),
  theater: <rect x="2" y="6" width="20" height="12" rx="2" />,
  fullscreen: (
    <>
      {P("M8 3H5a2 2 0 0 0-2 2v3")}
      {P("M21 8V5a2 2 0 0 0-2-2h-3")}
      {P("M3 16v3a2 2 0 0 0 2 2h3")}
      {P("M16 21h3a2 2 0 0 0 2-2v-3")}
    </>
  ),
  back: P("m15 18-6-6 6-6"),
  close: (
    <>
      {P("M18 6 6 18")}
      {P("m6 6 12 12")}
    </>
  ),
  external: (
    <>
      {P("M15 3h6v6")}
      {P("M10 14 21 3")}
      {P("M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")}
    </>
  ),
  camera: (
    <>
      {P("M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z")}
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  code: (
    <>
      {P("m16 18 6-6-6-6")}
      {P("m8 6-6 6 6 6")}
    </>
  ),
  book: (
    <>
      {P("M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z")}
      {P("M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z")}
    </>
  ),
  dumbbell: (
    <>
      {P("M6.5 6.5 17.5 17.5")}
      {P("m21 21-1-1")}
      {P("m3 3 1 1")}
      {P("m18 22 4-4")}
      {P("m2 6 4-4")}
      {P("m3 10 7-7")}
      {P("m14 21 7-7")}
    </>
  ),
  gamepad: (
    <>
      {P("M6 12h4")}
      {P("M8 10v4")}
      <circle cx="15" cy="13" r="1" />
      <circle cx="18" cy="11" r="1" />
      {P("M17.3 5H6.7a4 4 0 0 0-4 3.6L2 15.4A3 3 0 0 0 5 19c1 0 1.7-.5 2.2-1.2L8.6 16h6.8l1.4 1.8c.5.7 1.2 1.2 2.2 1.2a3 3 0 0 0 3-3.6l-.7-6.8A4 4 0 0 0 17.3 5z")}
    </>
  ),
  crescent: (
    <>
      {P("M15 3.5a8.5 8.5 0 1 0 5.5 13 7 7 0 0 1-5.5-13z")}
      {P("m18 7 .8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.3z")}
    </>
  ),
  bell: (
    <>
      {P("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9")}
      {P("M10.3 21a1.9 1.9 0 0 0 3.4 0")}
    </>
  ),
  edit: (
    <>
      {P("M12 20h9")}
      {P("M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z")}
    </>
  ),
  trash: (
    <>
      {P("M3 6h18")}
      {P("M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")}
      {P("M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6")}
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      {P("M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1")}
    </>
  ),
  plus: (
    <>
      {P("M12 5v14")}
      {P("M5 12h14")}
    </>
  ),
  undo: (
    <>
      {P("M9 14 4 9l5-5")}
      {P("M4 9h11a5 5 0 0 1 0 10h-3")}
    </>
  ),
  pulse: P("M22 12h-4l-3 9L9 3l-3 9H2"),
  zap: P("M4 14a1 1 0 0 1-.8-1.6l9.9-10.2a.5.5 0 0 1 .9.5l-1.9 6A1 1 0 0 0 13 10h7a1 1 0 0 1 .8 1.6l-9.9 10.2a.5.5 0 0 1-.9-.5l1.9-6A1 1 0 0 0 11 14z"),
  bulb: (
    <>
      {P("M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5")}
      {P("M9 18h6")}
      {P("M10 22h4")}
    </>
  ),
  pie: (
    <>
      {P("M21.2 15.9A10 10 0 1 1 8 2.8")}
      {P("M22 12A10 10 0 0 0 12 2v10z")}
    </>
  ),
  trend: (
    <>
      {P("m22 7-8.5 8.5-5-5L2 17")}
      {P("M16 7h6v6")}
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="8" r="6" />
      {P("M15.5 12.9 17 22l-5-3-5 3 1.5-9.1")}
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      {P("M12 6v6l4 2")}
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />
      {P("m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z")}
    </>
  ),
  goal: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      {P("M16 2v4")}
      {P("M8 2v4")}
      {P("M3 10h18")}
      {P("m9 16 2 2 4-4")}
    </>
  ),
};

export const ICON_NAMES = Object.keys(ICONS);

/** <Icon name="focus" /> — sized by `size` (px), coloured by the surrounding text colour. */
export function Icon({ name, size = 18, stroke = 2, className, title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {ICONS[name] ?? ICONS.dashboard}
    </svg>
  );
}
