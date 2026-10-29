// Prayer times (namaz) from the sun's position for a place and date — the standard astronomical method used by
// prayer-time apps (sun declination + equation of time, then the hour angle for each prayer's sun angle).
// Times are in the browser's local time zone. Local mosque timetables can differ by a few minutes (they often add
// safety margins), so the page says so and lets you shift a prayer block.

export const METHODS = {
  karachi: { label: "University of Islamic Sciences, Karachi (India, Pakistan, Bangladesh)", fajr: 18, isha: 18 },
  mwl: { label: "Muslim World League (Europe, Far East)", fajr: 18, isha: 17 },
  isna: { label: "ISNA (North America)", fajr: 15, isha: 15 },
  egypt: { label: "Egyptian General Authority (Africa, Middle East)", fajr: 19.5, isha: 17.5 },
  makkah: { label: "Umm al-Qura, Makkah (Arabian Peninsula)", fajr: 18.5, ishaMinutes: 90 },
};

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const fix = (a, b) => ((a % b) + b) % b;

function julian(y, m, d) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/** Sun declination (degrees) and equation of time (hours) at Julian date `jd`. */
function sun(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - ra };
}

/**
 * @param {Date} day  any time on the local date wanted
 * @param {{lat: number, lng: number, method?: keyof METHODS, asr?: "hanafi"|"shafi"}} opts
 * @returns {{fajr: Date, sunrise: Date, dhuhr: Date, asr: Date, maghrib: Date, isha: Date} | null} null near the poles
 */
export function prayerTimes(day, { lat, lng, method = "karachi", asr = "hanafi" }) {
  const m = METHODS[method] ?? METHODS.karachi;
  const jd = julian(day.getFullYear(), day.getMonth() + 1, day.getDate()) - lng / 360;
  const tz = -day.getTimezoneOffset() / 60;

  // solar times (hours, UTC-ish) — refined twice with the sun's position at each prayer's own time
  const noon = (t) => fix(12 - sun(jd + t / 24).eqt, 24);
  const angleTime = (angle, t, before) => {
    const { decl } = sun(jd + t / 24);
    const cos = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    if (cos < -1 || cos > 1) return NaN; // the sun never reaches that angle today (high latitudes)
    const T = deg(Math.acos(cos)) / 15;
    return noon(t) + (before ? -T : T);
  };
  const asrTime = (t) => {
    const { decl } = sun(jd + t / 24);
    const factor = asr === "hanafi" ? 2 : 1; // shadow length = factor × object + noon shadow
    const angle = -deg(Math.atan(1 / (factor + Math.tan(rad(Math.abs(lat - decl))))));
    return angleTime(angle, t, false);
  };

  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
  for (let i = 0; i < 2; i++) {
    t = {
      fajr: angleTime(m.fajr, t.fajr, true),
      sunrise: angleTime(0.833, t.sunrise, true),
      dhuhr: noon(t.dhuhr),
      asr: asrTime(t.asr),
      maghrib: angleTime(0.833, t.maghrib, false),
      isha: m.ishaMinutes ? NaN : angleTime(m.isha, t.isha, false),
    };
  }
  if (m.ishaMinutes) t.isha = t.maghrib + m.ishaMinutes / 60;
  if (Object.values(t).some(Number.isNaN)) return null;

  const offset = tz - lng / 15;
  const at = (h, plusMin = 0) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    d.setMinutes(Math.round((fix(h + offset, 24)) * 60) + plusMin);
    return d;
  };
  // Dhuhr a couple of minutes after true noon, Maghrib after the sun has fully set (common practice)
  return { fajr: at(t.fajr), sunrise: at(t.sunrise), dhuhr: at(t.dhuhr, 2), asr: at(t.asr), maghrib: at(t.maghrib, 1), isha: at(t.isha) };
}

export const PRAYERS = [
  ["fajr", "Fajr"],
  ["dhuhr", "Dhuhr"],
  ["asr", "Asr"],
  ["maghrib", "Maghrib"],
  ["isha", "Isha"],
];
