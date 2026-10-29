// Illustrations for the guided routines: an animated figure (yoga / posture) and an animated face (skincare).
// `p` is the blend between the two keyframes (0 → 1 → 0 over one cycle); `t` is the cycle phase 0 → 1.
import { POSES } from "@/lib/routines";

const lerp = (a, b, k) => a + (b - a) * k;
const mix = (A, B, k) => Object.fromEntries(Object.keys(A).map((j) => [j, [lerp(A[j][0], B[j][0], k), lerp(A[j][1], B[j][1], k)]]));
const line = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

/** Figure in pose `name`, blended `p` of the way from keyframe A to B. */
export function Figure({ name, p = 0, color = "#16a34a" }) {
  const [A, B] = POSES[name] ?? POSES.stand;
  const j = mix(A, B, p);
  const floor = !["stand", "necktilt", "shoulders", "chintuck", "walk"].includes(name);
  return (
    <svg viewBox="0 0 200 150" className="routine-art" aria-hidden="true">
      {floor && <rect x="20" y="139" width="160" height="5" rx="2.5" fill={color} opacity=".35" />}
      <line x1="10" y1="141" x2="190" y2="141" stroke="currentColor" strokeOpacity=".18" strokeWidth="2" />
      {name === "legsup" && <rect x="122" y="20" width="8" height="121" rx="2" fill="currentColor" opacity=".15" />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* far limbs lighter, for depth */}
        <path d={line([j.hip, j.rk, j.rf])} stroke={color} strokeOpacity=".55" strokeWidth="7" />
        <path d={line([j.neck, j.re, j.rh])} stroke={color} strokeOpacity=".55" strokeWidth="6" />
        <path d={line([j.neck, j.hip])} stroke={color} strokeWidth="9" />
        <path d={line([j.hip, j.lk, j.lf])} stroke={color} strokeWidth="7" />
        <path d={line([j.neck, j.le, j.lh])} stroke={color} strokeWidth="6" />
      </g>
      <circle cx={j.head[0]} cy={j.head[1]} r="9.5" fill={color} />
      {name === "bhramari" && (
        <g fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity={0.25 + p * 0.6}>
          <path d="M120 40a14 14 0 0 1 0 22" />
          <path d="M127 34a22 22 0 0 1 0 34" />
          <path d="M80 40a14 14 0 0 0 0 22" />
          <path d="M73 34a22 22 0 0 0 0 34" />
        </g>
      )}
      {["seated", "anulom", "bhramari", "legsup", "child"].includes(name) && (
        // breath cue: grows as you breathe in
        <circle cx="170" cy="30" r={6 + p * 8} fill={color} opacity={0.15 + p * 0.2} />
      )}
    </svg>
  );
}

const SKIN = "#e9b38f";
const SKIN_SHADE = "#d49a76";
const HAND = { fill: "#f0c3a2", stroke: "#a86f50", strokeWidth: 1.6 }; // hands: lighter + outlined, so they read as hands

/** A face with the skincare action `action` animating (t = phase 0..1, p = 0..1..0). */
export function FaceScene({ action, t = 0, p = 0, color = "#0284c7" }) {
  const circle = (cx, cy, r) => [cx + r * Math.cos(2 * Math.PI * t), cy + r * Math.sin(2 * Math.PI * t)];
  return (
    <svg viewBox="0 0 200 150" className="routine-art" aria-hidden="true">
      {/* neck, face, hair */}
      <rect x="86" y="104" width="28" height="30" rx="8" fill={SKIN_SHADE} />
      <path d="M50 150c6-22 26-30 50-30s44 8 50 30z" fill={color} opacity=".35" />
      <ellipse cx="100" cy="72" rx="38" ry="44" fill={SKIN} />
      <path d="M62 66c0-30 16-44 38-44s38 14 38 44c-6-14-20-22-38-22s-32 8-38 22z" fill="#3b2a23" />
      <ellipse cx="62" cy="76" rx="5" ry="9" fill={SKIN_SHADE} />
      <ellipse cx="138" cy="76" rx="5" ry="9" fill={SKIN_SHADE} />
      {/* eyes closed in calm arcs, soft smile */}
      <path d="M80 74q6 5 12 0M108 74q6 5 12 0" stroke="#3b2a23" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M100 78v10" stroke={SKIN_SHADE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M90 96q10 7 20 0" stroke="#b5654d" strokeWidth="2.4" fill="none" strokeLinecap="round" />

      {action === "rinse" && (
        <g>
          {[64, 84, 116, 136].map((x, i) => {
            const k = (t + i / 4) % 1;
            return <ellipse key={x} cx={x} cy={18 + k * 110} rx="3" ry="4.5" fill="#38bdf8" opacity={1 - k * 0.7} />;
          })}
          <circle cx="60" cy={92 - p * 18} r="11" {...HAND} />
          <circle cx="140" cy={92 - p * 18} r="11" {...HAND} />
        </g>
      )}
      {action === "cleanse" && (
        <g>
          {[[70, 88], [130, 88], [100, 46], [100, 104]].map(([x, y], i) => (
            <g key={i} opacity={0.5 + 0.5 * Math.sin(2 * Math.PI * (t + i / 4))}>
              <circle cx={x - 6} cy={y} r="4" fill="#fff" />
              <circle cx={x + 3} cy={y - 4} r="3" fill="#fff" />
              <circle cx={x + 4} cy={y + 4} r="2.5" fill="#fff" />
            </g>
          ))}
          <circle cx={circle(72, 88, 8)[0]} cy={circle(72, 88, 8)[1]} r="10" {...HAND} />
          <circle cx={circle(128, 88, -8)[0]} cy={circle(128, 88, 8)[1]} r="10" {...HAND} />
        </g>
      )}
      {action === "pat" && (
        <g>
          <rect x={136 - p * 10} y="60" width="34" height="42" rx="6" fill="#f8fafc" stroke="#cbd5e1" />
          <path d={`M${140 - p * 10} 70h26M${140 - p * 10} 80h26M${140 - p * 10} 90h26`} stroke="#93c5fd" strokeWidth="2" />
        </g>
      )}
      {action === "serum" && (
        <g>
          <rect x="94" y="4" width="12" height="14" rx="5" fill="#f59e0b" />
          <rect x="97" y="18" width="6" height="12" rx="2" fill="#fde68a" stroke="#f59e0b" />
          <ellipse cx="100" cy={34 + t * 18} rx="2.6" ry="3.6" fill="#f59e0b" opacity={1 - t} />
          {[[82, 88], [118, 88], [100, 52]].map(([x, y]) => (
            <circle key={x + y} cx={x} cy={y} r={2 + p * 2} fill="#f59e0b" opacity=".7" />
          ))}
        </g>
      )}
      {action === "moisturise" && (
        <g>
          {[[100, 50], [78, 88], [122, 88], [100, 84], [100, 106]].map(([x, y]) => (
            <ellipse key={x + y} cx={x} cy={y} rx={4 + p * 9} ry={4 + p * 5} fill="#fff" opacity={0.95 - p * 0.65} />
          ))}
          <circle cx={78 - p * 14} cy={86 - p * 8} r="9" {...HAND} />
        </g>
      )}
      {action === "sunscreen" && (
        <g>
          <g transform={`rotate(${t * 90} 170 26)`}>
            {Array.from({ length: 8 }, (_, i) => (
              <line key={i} x1="170" y1="10" x2="170" y2="15" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${i * 45} 170 26)`} />
            ))}
          </g>
          <circle cx="170" cy="26" r="8" fill="#fbbf24" />
          <path d="M60 64a40 46 0 0 1 80 0" fill="none" stroke="#fff" strokeWidth="5" opacity={0.25 + p * 0.5} strokeLinecap="round" />
          {[[80, 88], [120, 88], [100, 52], [100, 108]].map(([x, y]) => (
            <circle key={x + y} cx={x} cy={y} r={3 + p * 3} fill="#fff" opacity={0.9 - p * 0.5} />
          ))}
          <rect x="22" y="96" width="16" height="36" rx="4" fill="#fff" stroke="#f59e0b" strokeWidth="2" />
          <text x="30" y="118" textAnchor="middle" fontSize="7" fontWeight="800" fill="#f59e0b">SPF</text>
        </g>
      )}
    </svg>
  );
}

/** The right illustration for a routine step. */
export function StepArt({ step, t = 0, p = 0, color }) {
  return step.kind === "face" ? <FaceScene action={step.face} t={t} p={p} color={color} /> : <Figure name={step.pose} p={p} color={color} />;
}
