// The cover shown in a camera area before it starts: an illustration of what that page does, in the page's colour,
// a big play button (starts the camera) and a one-line hint — instead of a black box.
import { Icon } from "./Icons";

const ink = "#e2e8f0";

function Person({ x, y, s = 1, color, opacity = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      <circle cx="0" cy="-30" r="15" fill={ink} />
      <path d="M-28 22c0-22 12-34 28-34s28 12 28 34z" fill={color} />
    </g>
  );
}

const SCENES = {
  focus: (c) => (
    <>
      <rect x="60" y="138" width="200" height="6" rx="3" fill={ink} opacity=".25" />
      <Person x={118} y={118} color={c} />
      <circle cx="118" cy="88" r="27" fill="none" stroke={c} strokeWidth="2.5" strokeDasharray="5 5" />
      <circle cx="112" cy="87" r="2" fill="#0f172a" />
      <circle cx="124" cy="87" r="2" fill="#0f172a" />
      <rect x="170" y="98" width="62" height="40" rx="4" fill="#0f172a" stroke={ink} strokeOpacity=".5" />
      <rect x="160" y="137" width="82" height="5" rx="2" fill={ink} opacity=".5" />
      <path d="M180 126l10-10 8 6 14-14" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
      <g transform="translate(262 46)">
        <circle r="20" fill="none" stroke={ink} strokeOpacity=".2" strokeWidth="5" />
        <circle r="20" fill="none" stroke={c} strokeWidth="5" strokeDasharray="110 126" transform="rotate(-90)" strokeLinecap="round" />
        <text y="5" textAnchor="middle" fontSize="12" fontWeight="800" fill={ink}>87%</text>
      </g>
    </>
  ),
  speech: (c) => (
    <>
      <Person x={120} y={124} color={c} />
      <rect x="152" y="84" width="9" height="20" rx="4.5" fill={ink} />
      <path d="M156 104v30M146 134h20" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${172 + i * 12} ${82 - i * 6}a${18 + i * 12} ${18 + i * 12} 0 0 1 0 ${24 + i * 12}`} fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" opacity={1 - i * 0.25} />
      ))}
      <g transform="translate(222 40)">
        <rect x="-38" y="-14" width="76" height="26" rx="13" fill={c} />
        <text y="4" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">Confident</text>
      </g>
    </>
  ),
  conversation: (c) => (
    <>
      <Person x={92} y={126} color={c} />
      <Person x={228} y={126} color={ink} opacity=".7" />
      <g>
        <rect x="58" y="34" width="84" height="32" rx="14" fill={c} />
        <path d="M86 66l-6 10 14-10z" fill={c} />
        <rect x="70" y="45" width="56" height="4" rx="2" fill="#fff" opacity=".85" />
        <rect x="70" y="53" width="36" height="4" rx="2" fill="#fff" opacity=".6" />
      </g>
      <g>
        <rect x="178" y="22" width="84" height="32" rx="14" fill={ink} opacity=".85" />
        <path d="M234 54l6 10-14-10z" fill={ink} opacity=".85" />
        <rect x="190" y="33" width="56" height="4" rx="2" fill="#0f172a" opacity=".5" />
        <rect x="190" y="41" width="40" height="4" rx="2" fill="#0f172a" opacity=".35" />
      </g>
    </>
  ),
  interview: (c) => (
    <>
      <Person x={96} y={118} color={c} />
      <Person x={226} y={118} color={ink} opacity=".7" />
      <rect x="60" y="130" width="200" height="10" rx="3" fill={ink} opacity=".45" />
      <rect x="138" y="104" width="44" height="26" rx="4" fill={c} />
      <path d="M152 104v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" fill="none" stroke={c} strokeWidth="3" />
      <g transform="translate(250 34)">
        <rect x="-30" y="-16" width="60" height="44" rx="6" fill={ink} opacity=".9" />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(-20 ${-6 + i * 12})`}>
            <path d="M0 0l3 3 6-6" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
            <rect x="14" y="-2" width="24" height="4" rx="2" fill="#0f172a" opacity=".45" />
          </g>
        ))}
      </g>
    </>
  ),
  vision: (c) => (
    <>
      <rect x="40" y="138" width="240" height="5" rx="2" fill={ink} opacity=".25" />
      <path d="M78 136h30l-4-34H82z" fill={ink} />
      <path d="M108 110a8 8 0 0 1 0 16" fill="none" stroke={ink} strokeWidth="4" />
      <rect x="150" y="96" width="26" height="42" rx="5" fill="#0f172a" stroke={ink} strokeWidth="2.5" />
      <path d="M220 136h26l-4-22h-18z" fill={ink} opacity=".8" />
      <path d="M233 114c-14-6-18-24-8-34M233 114c12-8 16-24 6-34M233 114c0-14 0-26 0-40" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" />
      {[
        [70, 92, 48, 50, "cup 94%"],
        [144, 86, 38, 58, "phone 91%"],
        [206, 64, 54, 78, "plant 88%"],
      ].map(([x, y, w, h, label]) => (
        <g key={label}>
          <rect x={x} y={y} width={w} height={h} fill="none" stroke={c} strokeWidth="2" rx="3" />
          <rect x={x} y={y - 13} width={label.length * 5.6 + 6} height="13" rx="2" fill={c} />
          <text x={x + 3} y={y - 3} fontSize="9" fontWeight="800" fill="#fff">
            {label}
          </text>
        </g>
      ))}
    </>
  ),
  rooms: (c) => (
    <>
      {[0, 1, 2].flatMap((col) =>
        [0, 1].map((row) => {
          const x = 100 + col * 60, y = 72 + row * 56;
          const v = [0.9, 0.7, 0.8, 0.6, 0.95, 0.75][col * 2 + row];
          return (
            <g key={`${col}${row}`}>
              <circle cx={x} cy={y} r="20" fill="none" stroke={ink} strokeOpacity=".2" strokeWidth="4" />
              <circle cx={x} cy={y} r="20" fill="none" stroke={c} strokeWidth="4" strokeDasharray={`${v * 125.6} 125.6`} transform={`rotate(-90 ${x} ${y})`} strokeLinecap="round" />
              <circle cx={x} cy={y - 4} r="6" fill={ink} />
              <path d={`M${x - 10} ${y + 10}a10 9 0 0 1 20 0z`} fill={ink} />
            </g>
          );
        }),
      )}
    </>
  ),
};

/**
 * @param {{ kind: keyof SCENES, color: string, title: string, hint: string, loading?: boolean, onStart?: () => void,
 *           small?: boolean }} props
 */
export function CameraPoster({ kind, color, title, hint, loading = false, onStart, small = false }) {
  return (
    <div className={`cam-poster ${small ? "small" : ""}`} style={{ "--pc": color }}>
      <svg viewBox="0 0 320 180" className="cam-poster-art" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        {SCENES[kind]?.(color)}
      </svg>
      <div className="cam-poster-top">
        <span className="cam-poster-badge">
          <Icon name="camera" size={14} /> {loading ? "Starting…" : "Camera off"}
        </span>
        <b>{title}</b>
      </div>
      <button
        type="button"
        className="cam-poster-play"
        onClick={onStart}
        disabled={!onStart || loading}
        aria-label={loading ? "Starting camera" : `Start: ${title}`}
        tabIndex={onStart ? 0 : -1}
      >
        {loading ? <span className="spinner" /> : <Icon name="play" size={small ? 22 : 30} />}
      </button>
      <p className="cam-poster-hint">{hint}</p>
    </div>
  );
}
