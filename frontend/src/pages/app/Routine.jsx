// Daily Routine: a professional day (deep-work coding, work, reading, English speaking, exercise / yoga / gym, fun,
// sleep) with the five daily prayers at the real times for your location. Tick blocks off, see now / next, streaks,
// time balance and the last 7 days; each block has a Start button into the matching practice page.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/Link";
import { Icon } from "@/components/Icons";
import { PageHead, Donut } from "@/components/ui";
import { api } from "@/lib/api";
import { blocksFor, CATEGORIES, categoryHours, CITIES, dayKey, fromMin, newPlan, nowAndNext, TEMPLATES, todaysPrayers, toMin } from "@/lib/dailyRoutine";
import { METHODS, PRAYERS } from "@/lib/prayerTimes";
import { voiceCoach } from "@/lib/voiceCoach";

const minuteNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const clock = (min) => {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function useMinute() {
  const [m, setM] = useState(minuteNow);
  useEffect(() => {
    const id = setInterval(() => setM(minuteNow()), 15000);
    return () => clearInterval(id);
  }, []);
  return m;
}

function BlockRow({ x, now, done, onToggle, editing, onEdit, onDelete }) {
  const cat = CATEGORIES[x.category];
  const live = now?.id === x.id;
  if (editing && !x.prayer) {
    return (
      <li className="rt-row editing" style={{ "--c": cat.color }}>
        <input type="time" value={x.start} onChange={(e) => onEdit({ start: e.target.value })} aria-label="Start time" />
        <input type="number" min={5} max={720} step={5} value={x.minutes} onChange={(e) => onEdit({ minutes: Math.max(5, Number(e.target.value) || 5) })} aria-label="Minutes" />
        <input value={x.title} maxLength={80} onChange={(e) => onEdit({ title: e.target.value })} aria-label="Title" />
        <select value={x.category} onChange={(e) => onEdit({ category: e.target.value })} aria-label="Category">
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="rt-days" role="group" aria-label="Days">
          {WEEK.map((d, i) => (
            <button
              key={d}
              type="button"
              className={(x.days ?? [0, 1, 2, 3, 4, 5, 6]).includes(i) ? "on" : ""}
              onClick={() => {
                const days = x.days ?? [0, 1, 2, 3, 4, 5, 6];
                onEdit({ days: days.includes(i) ? days.filter((v) => v !== i) : [...days, i].sort() });
              }}
            >
              {d[0]}
            </button>
          ))}
        </div>
        <button className="rt-del" onClick={onDelete} aria-label={`Delete ${x.title}`} title="Delete">
          <Icon name="close" size={16} />
        </button>
      </li>
    );
  }
  return (
    <li className={`rt-row ${live ? "live" : ""} ${done ? "done" : ""}`} style={{ "--c": cat.color }}>
      <span className="rt-time">
        <b>{clock(x.startMin)}</b>
        <small>{dur(x.minutes)}</small>
      </span>
      <span className="nav-ico">
        <Icon name={cat.icon} size={17} />
      </span>
      <span className="rt-body">
        <b>
          {x.title} {live && <span className="rt-now">NOW</span>}
        </b>
        <small>
          {x.during ? `Pause ${x.during.toLowerCase()} · ` : ""}
          {x.note}
        </small>
      </span>
      {x.link && (
        <Link className="btn ghost sm" href={x.link}>
          <Icon name="play" size={13} /> Start
        </Link>
      )}
      <label className="rt-check" title={done ? "Done — click to undo" : "Mark done"}>
        <input type="checkbox" checked={done} onChange={onToggle} aria-label={`Done: ${x.title}`} />
        <span />
      </label>
    </li>
  );
}

export default function Routine() {
  const today = dayKey();
  const minute = useMinute();
  const [plan, setPlan] = useState(null);
  const [saved, setSaved] = useState(null); // last saved JSON, to know when there are unsaved edits
  const [checks, setChecks] = useState([]);
  const [history, setHistory] = useState([]);
  const [streak, setStreak] = useState(0);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const [locating, setLocating] = useState(false);
  const announced = useRef("");

  useEffect(() => {
    api(`/routine?day=${today}`)
      .then((r) => {
        const p = r.plan ?? newPlan();
        setPlan(p);
        setSaved(r.plan ? JSON.stringify(r.plan) : null);
        setChecks(r.checks);
        setHistory(r.history);
        setStreak(r.streak);
      })
      .catch((e) => {
        setErr(e.message);
        setPlan(newPlan());
      });
  }, [today]);

  const save = useCallback(async (p) => {
    try {
      await api("/routine", { method: "PUT", json: p });
      setSaved(JSON.stringify(p));
      setErr("");
    } catch (e) {
      setErr(`Couldn't save: ${e.message}`);
    }
  }, []);

  const update = (patch, persist = true) => {
    const p = { ...plan, ...patch };
    setPlan(p);
    if (persist) save(p);
  };

  const blocks = useMemo(() => blocksFor(plan, new Date()), [plan]);
  const prayers = useMemo(() => todaysPrayers(plan), [plan]);
  const { now, next } = nowAndNext(blocks, minute);
  const hours = categoryHours(blocks);
  const doneCount = blocks.filter((x) => checks.includes(x.id)).length;
  const pct = blocks.length ? Math.round((doneCount / blocks.length) * 100) : 0;
  const dirty = saved !== JSON.stringify(plan);

  const toggle = async (x) => {
    const done = !checks.includes(x.id);
    setChecks((c) => (done ? [...c, x.id] : c.filter((v) => v !== x.id)));
    try {
      const r = await api("/routine/check", { method: "PUT", json: { day: today, block_id: x.id, done } });
      setChecks(r.checks);
      setHistory((h) => h.map((d) => (d.day === today ? { ...d, done: r.checks.length } : d)));
      if (saved == null) save(plan); // first tick saves the template as your plan
    } catch (e) {
      setErr(e.message);
    }
  };

  // reminders: voice (+ a notification if allowed) when a block starts, while this page is open
  useEffect(() => {
    if (!plan?.reminders) return;
    const starting = blocks.find((x) => x.startMin === minute);
    const key = `${today}-${starting?.id}`;
    if (!starting || announced.current === key) return;
    announced.current = key;
    const text = starting.prayer ? `It's time for ${starting.title}.` : `It's ${clock(minute)} — time for ${starting.title}.`;
    voiceCoach.say(text);
    if ("Notification" in window && Notification.permission === "granted") new Notification("Daily routine", { body: text, icon: "/icon-192.png" });
  }, [minute, blocks, plan?.reminders, today]);

  const setReminders = async (on) => {
    if (on && "Notification" in window && Notification.permission === "default") await Notification.requestPermission().catch(() => {});
    update({ reminders: on });
  };

  const locate = () => {
    if (!navigator.geolocation) return setErr("This browser can't share location — pick your city instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        update({ prayer: { ...plan.prayer, lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4), place: "My location" } });
      },
      () => {
        setLocating(false);
        setErr("Location was blocked — pick your city from the list instead.");
      },
      { timeout: 10000 },
    );
  };

  if (!plan) {
    return <div className="card skeleton" style={{ height: 300 }} />;
  }

  const nextPrayer = prayers && PRAYERS.map(([k, n]) => [k, n, prayers[k]]).find(([, , t]) => t.getHours() * 60 + t.getMinutes() > minute);
  const inNow = now ? Math.max(0, (now.endMin > 1440 && minute < now.startMin ? minute + 1440 : minute) - now.startMin) : 0;
  const editBlock = (id, patch) => update({ blocks: plan.blocks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, false);
  const planBlocks = editing ? [...plan.blocks].sort((a, z) => toMin(a.start) - toMin(z.start)) : null;

  return (
    <>
      <PageHead
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        title="Daily Routine"
        highlight="Routine"
        sub="A professional day built around deep work — AI/ML coding, reading, English speaking, exercise, yoga and gym, real rest and fun — with namaz at the exact times for where you are."
      />
      {err && <div className="alert error">{err}</div>}

      {/* ---------------------------------------------------------------- now / next / progress */}
      <section className="card rt-hero tinted" style={{ "--c": now ? CATEGORIES[now.category].color : "#0f766e" }}>
        <div className="rt-now-card">
          <span className="eyebrow">Right now · {clock(minute)}</span>
          {now ? (
            <>
              <h2>
                <span className="nav-ico lg">
                  <Icon name={CATEGORIES[now.category].icon} size={22} />
                </span>
                {now.title}
              </h2>
              <div className="rt-progress">
                <div style={{ width: `${Math.min(100, (inNow / now.minutes) * 100)}%` }} />
              </div>
              <p className="muted">
                {dur(Math.max(0, now.minutes - inNow))} left · {now.note}
              </p>
              <div className="row" style={{ flex: "none", flexWrap: "wrap" }}>
                {now.link && (
                  <Link className="btn" href={now.link}>
                    <Icon name="play" size={15} /> Start now
                  </Link>
                )}
                <button className="btn ghost" onClick={() => toggle(now)}>
                  {checks.includes(now.id) ? "✓ Done" : "Mark done"}
                </button>
              </div>
            </>
          ) : (
            <h2>Free time</h2>
          )}
          {next && (
            <p className="rt-next">
              Next: <b>{next.title}</b> at {clock(next.startMin)}
            </p>
          )}
        </div>
        <div className="rt-stats">
          <Donut segments={[["Done", pct, "var(--ok)"]]} size={128} center={`${doneCount}/${blocks.length}`} caption="done today" label={`${doneCount} of ${blocks.length} blocks done today`} />
          <div className="rt-streak">
            <Icon name="flame" size={20} />
            <b>{streak}</b>
            <span>day streak</span>
          </div>
        </div>
      </section>

      <div className="grid split-3-2 rt-grid">
        {/* ---------------------------------------------------------------- timeline */}
        <section className="card">
          <header className="chart-head">
            <span className="nav-ico" style={{ "--c": "#0f766e" }}>
              <Icon name="clock" size={17} />
            </span>
            <div className="chart-head-text">
              <h3>{editing ? "Edit your routine" : "Today's timeline"}</h3>
              <p className="small muted">{editing ? "Times, length, days and category — namaz is added automatically." : `${TEMPLATES[plan.template]?.label ?? "Your"} routine · tick each block when done`}</p>
            </div>
            {editing ? (
              <button
                className="btn sm"
                onClick={() => {
                  save(plan);
                  setEditing(false);
                }}
              >
                Save
              </button>
            ) : (
              <button className="btn ghost sm" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </header>
          {editing ? (
            <>
              <ul className="rt-list">
                {planBlocks.map((x) => (
                  <BlockRow
                    key={x.id}
                    x={x}
                    editing
                    onEdit={(patch) => editBlock(x.id, patch)}
                    onDelete={() => update({ blocks: plan.blocks.filter((v) => v.id !== x.id) }, false)}
                  />
                ))}
              </ul>
              <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
                <button
                  className="btn ghost sm"
                  disabled={plan.blocks.length >= 50}
                  onClick={() =>
                    update(
                      { blocks: [...plan.blocks, { id: `b${Date.now().toString(36)}`, start: fromMin(minute + 30 - (minute % 5)), minutes: 30, category: "learning", title: "New block", note: "", link: "", days: [0, 1, 2, 3, 4, 5, 6] }] },
                      false,
                    )
                  }
                >
                  + Add block
                </button>
                {Object.entries(TEMPLATES).map(([k, t]) => (
                  <button
                    key={k}
                    className="btn ghost sm"
                    onClick={() => window.confirm(`Replace your routine with the "${t.label}" template?`) && update({ ...newPlan(k), prayer: plan.prayer, reminders: plan.reminders }, false)}
                  >
                    Use “{t.label}”
                  </button>
                ))}
                <button className="btn ghost sm" onClick={() => {
                    setEditing(false);
                    setPlan(saved ? JSON.parse(saved) : newPlan());
                  }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <ul className="rt-list">
              {blocks.map((x) => (
                <BlockRow key={x.id} x={x} now={now} done={checks.includes(x.id)} onToggle={() => toggle(x)} />
              ))}
            </ul>
          )}
          {dirty && !editing && saved != null && <p className="small muted">Unsaved changes…</p>}
        </section>

        <div className="rt-side">
          {/* ---------------------------------------------------------------- namaz */}
          <section className="card tinted" style={{ "--c": "#0d9488" }}>
            <header className="chart-head">
              <span className="nav-ico">
                <Icon name="crescent" size={17} />
              </span>
              <div className="chart-head-text">
                <h3>Namaz times</h3>
                <p className="small muted">{plan.prayer.place ? `${plan.prayer.place} · ` : ""}calculated for today</p>
              </div>
              <label className="gm-switch rt-switch">
                <input type="checkbox" checked={plan.prayer.enabled} onChange={(e) => update({ prayer: { ...plan.prayer, enabled: e.target.checked } })} aria-label="Include namaz" />
              </label>
            </header>
            {plan.prayer.enabled && (
              <>
                {prayers ? (
                  <ul className="rt-prayers">
                    {PRAYERS.map(([k, name]) => {
                      const t = prayers[k];
                      const isNext = nextPrayer?.[0] === k;
                      return (
                        <li key={k} className={isNext ? "next" : ""}>
                          <span>{k === "dhuhr" && new Date().getDay() === 5 ? "Jumu'ah" : name}</span>
                          <b>{clock(t.getHours() * 60 + t.getMinutes())}</b>
                          {isNext && <small>in {dur(t.getHours() * 60 + t.getMinutes() - minute)}</small>}
                          <input type="checkbox" checked={checks.includes(`prayer-${k}`)} onChange={() => toggle({ id: `prayer-${k}` })} aria-label={`${name} prayed`} />
                        </li>
                      );
                    })}
                    <li className="muted small">
                      <span>Sunrise</span>
                      <b>{clock(prayers.sunrise.getHours() * 60 + prayers.sunrise.getMinutes())}</b>
                    </li>
                  </ul>
                ) : plan.prayer.lat == null ? (
                  <p className="small">Set your location to get exact prayer times:</p>
                ) : (
                  <p className="small">Prayer times can't be calculated for this location today (far north/south) — use your local mosque timetable.</p>
                )}
                <div className="rt-prayer-settings">
                  <button className="btn ghost sm" onClick={locate} disabled={locating}>
                    <Icon name="target" size={14} /> {locating ? "Locating…" : "Use my location"}
                  </button>
                  <select
                    aria-label="City"
                    value={CITIES.find(([n]) => n === plan.prayer.place)?.[0] ?? ""}
                    onChange={(e) => {
                      const c = CITIES.find(([n]) => n === e.target.value);
                      if (c) update({ prayer: { ...plan.prayer, place: c[0], lat: c[1], lng: c[2] } });
                    }}
                  >
                    <option value="">or pick a city…</option>
                    {CITIES.map(([n]) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <select aria-label="Calculation method" value={plan.prayer.method} onChange={(e) => update({ prayer: { ...plan.prayer, method: e.target.value } })}>
                    {Object.entries(METHODS).map(([k, m]) => (
                      <option key={k} value={k}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Asr" value={plan.prayer.asr} onChange={(e) => update({ prayer: { ...plan.prayer, asr: e.target.value } })}>
                    <option value="hanafi">Asr: Hanafi</option>
                    <option value="shafi">Asr: Shafi'i, Maliki, Hanbali</option>
                  </select>
                </div>
                <p className="small muted">Calculated from the sun's position. Your mosque's timetable may differ by a few minutes — follow your mosque.</p>
              </>
            )}
          </section>

          {/* ---------------------------------------------------------------- balance */}
          <section className="card tinted" style={{ "--c": "#7c3aed" }}>
            <header className="chart-head">
              <span className="nav-ico">
                <Icon name="pie" size={17} />
              </span>
              <div className="chart-head-text">
                <h3>Today's balance</h3>
                <p className="small muted">Hours planned per area</p>
              </div>
            </header>
            <div className="pattern-chart">
              <Donut
                size={136}
                segments={hours.map((h) => [h.label, (h.hours / 24) * 100, h.color])}
                center={`${hours.find((h) => h.key === "coding")?.hours.toFixed(1) ?? 0}h`}
                caption="coding"
                label={hours.map((h) => `${h.label} ${h.hours.toFixed(1)} hours`).join(", ")}
              />
              <div className="legend">
                {hours.map((h) => (
                  <div key={h.key}>
                    <i style={{ background: h.color }} />
                    {h.label}
                    <b>{h.hours.toFixed(1)}h</b>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- last 7 days + reminders */}
          <section className="card tinted" style={{ "--c": "#16a34a" }}>
            <header className="chart-head">
              <span className="nav-ico">
                <Icon name="chart" size={17} />
              </span>
              <div className="chart-head-text">
                <h3>Last 7 days</h3>
                <p className="small muted">Blocks ticked off per day</p>
              </div>
            </header>
            <div className="rt-week" role="img" aria-label={history.map((h) => `${h.day}: ${h.done} done`).join(", ")}>
              {history.map((h) => {
                const d = new Date(`${h.day}T12:00`);
                return (
                  <div key={h.day} title={`${h.done} done`}>
                    <span style={{ height: `${Math.min(100, (h.done / Math.max(1, blocks.length)) * 100)}%` }} />
                    <small>{WEEK[d.getDay()]}</small>
                    <b>{h.done}</b>
                  </div>
                );
              })}
            </div>
            <label className="gm-switch">
              <span>
                <b>
                  <Icon name="bell" size={15} /> Reminders
                </b>
                <br />
                <span className="small muted">A spoken reminder (and a notification) when each block or namaz starts — while this page is open.</span>
              </span>
              <input type="checkbox" checked={!!plan.reminders} onChange={(e) => setReminders(e.target.checked)} />
            </label>
          </section>
        </div>
      </div>
    </>
  );
}
