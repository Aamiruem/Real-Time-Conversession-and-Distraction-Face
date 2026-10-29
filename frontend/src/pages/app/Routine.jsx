// Daily Routine: a professional day (deep-work coding, work, reading, English speaking, exercise / yoga / gym, fun,
// sleep) with the five daily prayers at the real times for your location.
// Create / edit / duplicate / delete blocks (with undo), preview any weekday, tick blocks off, see now / next,
// streak, time balance and the last 7 days; every change is saved to your account straight away.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/Link";
import { Icon } from "@/components/Icons";
import { Donut, PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import {
  blocksFor, CATEGORIES, categoryHours, CITIES, clock12, DAY_PRESETS, dayKey, fromMin, LINKS, newPlan, nextWeekday,
  nowAndNext, overlapping, TEMPLATES, timeRange, todaysPrayers, toMin,
} from "@/lib/dailyRoutine";
import { METHODS, PRAYERS } from "@/lib/prayerTimes";
import { voiceCoach } from "@/lib/voiceCoach";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const minuteNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const minOf = (date) => date.getHours() * 60 + date.getMinutes();
const PARTS = {
  Morning: { icon: "sun", hours: "5 am – 12 pm" },
  Afternoon: { icon: "sun", hours: "12 – 5 pm" },
  Evening: { icon: "moon", hours: "5 – 9 pm" },
  Night: { icon: "moon", hours: "9 pm – 5 am" },
};
const partOfDay = (min) => (min == null ? null : min >= 300 && min < 720 ? "Morning" : min >= 720 && min < 1020 ? "Afternoon" : min >= 1020 && min < 1260 ? "Evening" : "Night");

function useMinute() {
  const [m, setM] = useState(minuteNow);
  useEffect(() => {
    const id = setInterval(() => setM(minuteNow()), 15000);
    return () => clearInterval(id);
  }, []);
  return m;
}

/** An accessible on/off switch. */
function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="switch-row">
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

// ---------------------------------------------------------------------------------------------- add / edit form
function BlockForm({ initial, blocks, onSave, onDelete, onClose }) {
  const [b, setB] = useState(initial);
  const first = useRef(null);
  const set = (patch) => setB((x) => ({ ...x, ...patch }));
  const clash = overlapping(blocks, b).filter((x) => x.category !== "sleep" || b.category === "sleep");
  const valid = b.title.trim() && /^\d{2}:\d{2}$/.test(b.start) && b.minutes >= 5 && b.minutes <= 720 && b.days.length;
  const isNew = !blocks.some((x) => x.id === b.id);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    if (valid) onSave({ ...b, title: b.title.trim(), note: b.note.trim() });
  };

  return (
    <div className="rt-modal-backdrop" onClick={onClose}>
      <form className="rt-modal" role="dialog" aria-modal="true" aria-labelledby="rt-form-title" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3 id="rt-form-title">{isNew ? "Add a block" : "Edit block"}</h3>
          <button type="button" className="rt-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        <label className="rt-field">
          <span>What</span>
          <input ref={first} value={b.title} maxLength={80} required placeholder="e.g. Deep work — model training" onChange={(e) => set({ title: e.target.value })} />
        </label>

        <div className="rt-field">
          <span>Category</span>
          <div className="rt-cats" role="radiogroup" aria-label="Category">
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button key={k} type="button" role="radio" aria-checked={b.category === k} className={b.category === k ? "on" : ""} style={{ "--c": c.color }} onClick={() => set({ category: k })}>
                <Icon name={c.icon} size={15} /> {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rt-field-row">
          <label className="rt-field">
            <span>Starts</span>
            <input type="time" value={b.start} required onChange={(e) => set({ start: e.target.value })} />
          </label>
          <label className="rt-field">
            <span>Minutes</span>
            <input type="number" min={5} max={720} step={5} value={b.minutes} required onChange={(e) => set({ minutes: Number(e.target.value) })} />
          </label>
          <div className="rt-field">
            <span>Quick</span>
            <div className="rt-chips">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button key={m} type="button" className={b.minutes === m ? "on" : ""} onClick={() => set({ minutes: m })}>
                  {dur(m)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/^\d{2}:\d{2}$/.test(b.start) && b.minutes >= 5 && <p className="small muted rt-range">{timeRange(toMin(b.start), b.minutes)}</p>}

        <div className="rt-field">
          <span>Days</span>
          <div className="rt-chips">
            {WEEK.map((d, i) => (
              <button
                key={d}
                type="button"
                className={b.days.includes(i) ? "on" : ""}
                aria-pressed={b.days.includes(i)}
                onClick={() => set({ days: b.days.includes(i) ? b.days.filter((v) => v !== i) : [...b.days, i].sort() })}
              >
                {d}
              </button>
            ))}
            <span className="rt-sep" />
            {DAY_PRESETS.map(([label, days]) => (
              <button key={label} type="button" className="ghost" onClick={() => set({ days })}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="rt-field">
          <span>Start button opens</span>
          <select value={b.link} onChange={(e) => set({ link: e.target.value })}>
            {LINKS.map(([href, label]) => (
              <option key={href} value={href}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="rt-field">
          <span>Notes (optional)</span>
          <textarea rows={2} maxLength={300} value={b.note} placeholder="What exactly you'll do — e.g. 2 LeetCode problems, chapter 4 of the ML book" onChange={(e) => set({ note: e.target.value })} />
        </label>

        {clash.length > 0 && (
          <p className="alert rt-clash">
            <Icon name="clock" size={15} /> Overlaps {clash.map((x) => `${x.title} (${timeRange(toMin(x.start), x.minutes)})`).join(", ")}. That's fine if
            intended — otherwise change the time.
          </p>
        )}
        {!b.days.length && <p className="alert error">Pick at least one day.</p>}

        <footer>
          {!isNew && (
            <button type="button" className="btn ghost danger-text" onClick={() => onDelete(b)}>
              <Icon name="trash" size={15} /> Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!valid}>
            {isNew ? "Add block" : "Save changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}

/** "Are you sure?" before a block is deleted. Delete is never the default: Enter / Escape keep the block. */
function ConfirmDelete({ block, onCancel, onConfirm }) {
  const cancel = useRef(null);
  useEffect(() => {
    cancel.current?.focus();
    // capture phase + stop: Escape cancels only this dialog, not the edit form underneath
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  const days = block.days ?? ALL_DAYS;
  const when = days.length === 7 ? "every day" : days.length ? days.map((d) => WEEK[d]).join(", ") : "no days";
  return (
    <div className="rt-modal-backdrop confirm" onClick={onCancel}>
      <div className="rt-modal rt-confirm" role="alertdialog" aria-modal="true" aria-labelledby="rt-del-title" aria-describedby="rt-del-desc" onClick={(e) => e.stopPropagation()}>
        <span className="rt-confirm-icon" aria-hidden="true">
          <Icon name="trash" size={22} />
        </span>
        <h3 id="rt-del-title">Delete “{block.title}”?</h3>
        <p id="rt-del-desc" className="muted">
          {timeRange(toMin(block.start), block.minutes)} · {when}. It will be removed from your routine on all these days.
        </p>
        <footer>
          <button ref={cancel} className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn rt-danger" onClick={onConfirm}>
            <Icon name="trash" size={15} /> Delete
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- one timeline row
function BlockRow({ x, part, live, done, canTick, onToggle, onEdit, onCopy, onDelete }) {
  const cat = CATEGORIES[x.category];
  return (
    <>
    {part && (
      <li className="rt-part" aria-hidden="true">
        <Icon name={PARTS[part].icon} size={14} /> {part} <small>{PARTS[part].hours}</small>
      </li>
    )}
    <li className={`rt-row ${live ? "live" : ""} ${done ? "done" : ""}`} style={{ "--c": cat.color }}>
      <span className="rt-time">
        <b>{clock12(x.startMin)}</b>
        <small>
          – {clock12(x.endMin)} · {dur(x.minutes)}
        </small>
      </span>
      <span className="nav-ico">
        <Icon name={cat.icon} size={17} />
      </span>
      <span className="rt-body" title={[x.title, x.during && `During “${x.during}”`, x.note].filter(Boolean).join(" · ")}>
        <b>
          <span>{x.title}</span>
          {live && <span className="rt-now">NOW</span>}
        </b>
        <small>{x.during ? `During “${x.during}”` : x.note || cat.label}</small>
      </span>
      <span className="rt-actions">
        {x.link && (
          <Link className="btn ghost sm" href={x.link} title="Open the practice page for this block">
            <Icon name="play" size={13} /> Start
          </Link>
        )}
        {!x.prayer && (
          <>
            <button className="rt-icon-btn" onClick={onEdit} aria-label={`Edit ${x.title}`} title="Edit">
              <Icon name="edit" size={16} />
            </button>
            <button className="rt-icon-btn" onClick={onCopy} aria-label={`Duplicate ${x.title}`} title="Duplicate">
              <Icon name="copy" size={16} />
            </button>
            <button className="rt-icon-btn danger" onClick={onDelete} aria-label={`Delete ${x.title}`} title="Delete">
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </span>
      <label className={`rt-check ${canTick ? "" : "off"}`} title={!canTick ? "You can tick off today's blocks" : done ? "Done — click to undo" : "Mark done"}>
        <input type="checkbox" checked={done} disabled={!canTick} onChange={onToggle} aria-label={`Done: ${x.title}`} />
        <span />
      </label>
    </li>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- page
export default function Routine() {
  const today = dayKey();
  const minute = useMinute();
  const [plan, setPlan] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [checks, setChecks] = useState([]);
  const [history, setHistory] = useState([]);
  const [streak, setStreak] = useState(0);
  const [viewDay, setViewDay] = useState(null); // null = today, else weekday 0-6 to preview
  const [form, setForm] = useState(null); // block being added / edited
  const [confirmDel, setConfirmDel] = useState(null); // block waiting for "are you sure?"
  const [toast, setToast] = useState(null); // { text, undo? }
  const [err, setErr] = useState("");
  const [locating, setLocating] = useState(false);
  const announced = useRef("");
  const toastTimer = useRef(0);

  useEffect(() => {
    api(`/routine?day=${today}`)
      .then((r) => {
        setPlan(r.plan ?? newPlan());
        setHasSaved(!!r.plan);
        setChecks(r.checks);
        setHistory(r.history);
        setStreak(r.streak);
      })
      .catch((e) => {
        setErr(e.message);
        setPlan(newPlan());
      });
  }, [today]);

  const notify = useCallback((text, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 7000 : 2500);
  }, []);

  /** Apply a change and save it to the account straight away. */
  const commit = useCallback(
    async (next, message = "Saved", undo) => {
      setPlan(next);
      try {
        await api("/routine", { method: "PUT", json: next });
        setHasSaved(true);
        setErr("");
        notify(message, undo);
      } catch (e) {
        setErr(`Couldn't save: ${e.message}`);
      }
    },
    [notify],
  );

  const viewDate = viewDay == null ? new Date() : nextWeekday(viewDay);
  const isToday = viewDay == null || viewDay === new Date().getDay();
  const viewKey = viewDate.toDateString();
  const blocks = useMemo(() => blocksFor(plan, new Date(viewKey)), [plan, viewKey]);
  const todayBlocks = useMemo(() => blocksFor(plan, new Date()), [plan]);
  const prayers = useMemo(() => todaysPrayers(plan), [plan]);
  const { now, next } = nowAndNext(todayBlocks, minute);
  const hours = categoryHours(blocks);
  const doneCount = todayBlocks.filter((x) => checks.includes(x.id)).length;
  const pct = todayBlocks.length ? Math.round((doneCount / todayBlocks.length) * 100) : 0;

  const toggle = async (id) => {
    const done = !checks.includes(id);
    setChecks((c) => (done ? [...c, id] : c.filter((v) => v !== id)));
    try {
      const r = await api("/routine/check", { method: "PUT", json: { day: today, block_id: id, done } });
      setChecks(r.checks);
      setHistory((h) => h.map((d) => (d.day === today ? { ...d, done: r.checks.length } : d)));
      if (!hasSaved) commit(plan, "Routine saved to your account");
    } catch (e) {
      setErr(e.message);
    }
  };

  // ---- CRUD
  const blank = () => ({ id: `b${Date.now().toString(36)}`, title: "", category: "coding", start: fromMin(Math.ceil((minute + 15) / 15) * 15), minutes: 60, days: [...ALL_DAYS], note: "", link: "" });
  const saveBlock = (b) => {
    const exists = plan.blocks.some((x) => x.id === b.id);
    if (!exists && plan.blocks.length >= 60) return setErr("A routine can have up to 60 blocks.");
    const blocksNext = exists ? plan.blocks.map((x) => (x.id === b.id ? b : x)) : [...plan.blocks, b];
    commit({ ...plan, blocks: blocksNext, template: "custom" }, exists ? `“${b.title}” updated` : `“${b.title}” added`);
    setForm(null);
  };
  const removeBlock = (b) => {
    const before = plan;
    commit({ ...plan, blocks: plan.blocks.filter((x) => x.id !== b.id), template: "custom" }, `“${b.title}” deleted`, () => commit(before, "Restored"));
    setForm(null);
  };
  const duplicate = (b) => {
    const copy = { ...b, id: `b${Date.now().toString(36)}`, title: `${b.title} (copy)`, start: fromMin(toMin(b.start) + b.minutes) };
    setForm({ ...copy, days: copy.days ?? [...ALL_DAYS], note: copy.note ?? "", link: copy.link ?? "" });
  };
  const applyTemplate = (k) => {
    if (!window.confirm(`Replace your routine with the "${TEMPLATES[k].label}" template? Your namaz settings stay.`)) return;
    const before = plan;
    commit({ ...newPlan(k), prayer: plan.prayer, reminders: plan.reminders }, `“${TEMPLATES[k].label}” routine applied`, () => commit(before, "Restored"));
  };
  const planBlock = (id) => {
    const b = plan.blocks.find((x) => x.id === id);
    return b && { days: [...ALL_DAYS], note: "", link: "", ...b };
  };

  // ---- reminders while this page is open
  useEffect(() => {
    if (!plan?.reminders) return;
    const starting = todayBlocks.find((x) => x.startMin === minute);
    const key = `${today}-${starting?.id}`;
    if (!starting || announced.current === key) return;
    announced.current = key;
    const text = starting.prayer ? `It's time for ${starting.title}.` : `It's ${clock12(minute)} — time for ${starting.title}.`;
    voiceCoach.say(text);
    if ("Notification" in window && Notification.permission === "granted") new Notification("Daily routine", { body: text, icon: "/icon-192.png" });
  }, [minute, todayBlocks, plan?.reminders, today]);

  const setReminders = async (on) => {
    if (on && "Notification" in window && Notification.permission === "default") await Notification.requestPermission().catch(() => {});
    commit({ ...plan, reminders: on }, on ? "Reminders on — keep this tab open" : "Reminders off");
  };
  const setPrayer = (patch, message = "Namaz settings saved") => commit({ ...plan, prayer: { ...plan.prayer, ...patch } }, message);

  const locate = () => {
    if (!navigator.geolocation) return setErr("This browser can't share location — pick your city instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPrayer({ lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4), place: "My location" }, "Location saved");
      },
      () => {
        setLocating(false);
        setErr("Location was blocked — pick your city from the list instead.");
      },
      { timeout: 10000 },
    );
  };

  if (!plan) return <div className="card skeleton" style={{ height: 320 }} />;

  const nextPrayer = prayers && PRAYERS.find(([k]) => minOf(prayers[k]) > minute);
  const inNow = now ? (now.endMin > 1440 && minute < now.startMin ? minute + 1440 : minute) - now.startMin : 0;
  const nowCat = now ? CATEGORIES[now.category] : null;

  return (
    <>
      <PageHead
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        title="Daily Routine"
        highlight="Routine"
        sub="A professional day built around deep work — AI/ML coding, reading, English speaking, exercise, yoga and gym, real rest and fun — with namaz at the exact times for where you are."
      />
      {err && (
        <div className="alert error" role="alert">
          {err}
        </div>
      )}

      {/* ---------------------------------------------------------------- now / next / progress */}
      <section className="card rt-hero tinted" style={{ "--c": nowCat?.color ?? "#0f766e" }} aria-label="Right now">
        <div className="rt-now-card">
          <span className="eyebrow">Right now · {clock12(minute)}</span>
          {now ? (
            <>
              <h2>
                <span className="nav-ico lg">
                  <Icon name={nowCat.icon} size={22} />
                </span>
                <span>
                  {now.title}
                  <small>{timeRange(now.startMin, now.minutes)}</small>
                </span>
              </h2>
              <div className="rt-progress" role="progressbar" aria-valuenow={Math.round((inNow / now.minutes) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Block progress">
                <div style={{ width: `${Math.min(100, (inNow / now.minutes) * 100)}%` }} />
              </div>
              <p className="rt-now-note">
                <b>{dur(Math.max(0, now.minutes - inNow))} left</b> · {now.note || nowCat.label}
              </p>
              <div className="rt-hero-actions">
                {now.link && (
                  <Link className="btn" href={now.link}>
                    <Icon name="play" size={15} /> Start now
                  </Link>
                )}
                <button className={`btn ${now.link ? "ghost" : ""}`} onClick={() => toggle(now.id)}>
                  {checks.includes(now.id) ? "✓ Done — undo" : "Mark done"}
                </button>
              </div>
            </>
          ) : (
            <h2>Free time — nothing planned</h2>
          )}
          {next && (
            <p className="rt-next">
              <Icon name="next" size={14} /> Next: <b>{next.title}</b> at {clock12(next.startMin)}
              {next.startMin > minute && ` (in ${dur(next.startMin - minute)})`}
            </p>
          )}
        </div>
        <div className="rt-stats">
          <Donut segments={[["Done", pct, "var(--ok)"]]} size={124} center={`${pct}%`} caption={`${doneCount} of ${todayBlocks.length} done`} label={`${doneCount} of ${todayBlocks.length} blocks done today`} />
          <div className="rt-streak">
            <Icon name="flame" size={20} />
            <b>{streak}</b>
            <span>day streak</span>
          </div>
        </div>
      </section>

      <div className="grid split-3-2 rt-grid">
        {/* ---------------------------------------------------------------- timeline + CRUD */}
        <section className="card" aria-labelledby="rt-tl">
          <header className="chart-head">
            <span className="nav-ico" style={{ "--c": "#0f766e" }}>
              <Icon name="clock" size={17} />
            </span>
            <div className="chart-head-text">
              <h3 id="rt-tl">{isToday ? "Today's timeline" : `${WEEK[viewDay]}day plan`}</h3>
              <p className="small muted">
                {TEMPLATES[plan.template]?.label ?? "Your own"} routine · {blocks.length} blocks · saved to your account
              </p>
            </div>
            <button className="btn sm" onClick={() => setForm(blank())}>
              <Icon name="plus" size={15} /> Add block
            </button>
          </header>

          <div className="rt-toolbar">
            <div className="rt-chips" role="tablist" aria-label="Day">
              <button role="tab" aria-selected={isToday} className={isToday ? "on" : ""} onClick={() => setViewDay(null)}>
                Today
              </button>
              {WEEK.map((d, i) =>
                i === new Date().getDay() ? null : (
                  <button key={d} role="tab" aria-selected={viewDay === i} className={viewDay === i ? "on" : ""} onClick={() => setViewDay(i)}>
                    {d}
                  </button>
                ),
              )}
            </div>
            <select
              className="rt-template"
              aria-label="Apply a template"
              value=""
              onChange={(e) => e.target.value && applyTemplate(e.target.value)}
            >
              <option value="">Templates…</option>
              {Object.entries(TEMPLATES).map(([k, t]) => (
                <option key={k} value={k}>
                  Use “{t.label}”
                </option>
              ))}
            </select>
          </div>

          {blocks.length ? (
            <ul className="rt-list">
              {blocks.map((x, i) => (
                <BlockRow
                  key={x.id}
                  part={partOfDay(x.startMin) !== partOfDay(blocks[i - 1]?.startMin) ? partOfDay(x.startMin) : null}
                  x={x}
                  live={isToday && now?.id === x.id}
                  done={isToday && checks.includes(x.id)}
                  canTick={isToday}
                  onToggle={() => toggle(x.id)}
                  onEdit={() => setForm(planBlock(x.id))}
                  onCopy={() => duplicate(planBlock(x.id))}
                  onDelete={() => setConfirmDel(planBlock(x.id))}
                />
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing planned for this day. Add a block or apply a template.</p>
          )}
        </section>

        <div className="rt-side">
          {/* ---------------------------------------------------------------- namaz */}
          <section className="card tinted" style={{ "--c": "#0d9488" }} aria-labelledby="rt-namaz">
            <header className="chart-head">
              <span className="nav-ico">
                <Icon name="crescent" size={17} />
              </span>
              <div className="chart-head-text">
                <h3 id="rt-namaz">Namaz times</h3>
                <p className="small muted">{plan.prayer.place ? `${plan.prayer.place} · ` : ""}today, {new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
              </div>
            </header>
            <Switch checked={plan.prayer.enabled} onChange={(on) => setPrayer({ enabled: on }, on ? "Namaz added to your routine" : "Namaz hidden")} label="Include namaz in my routine" />
            {plan.prayer.enabled && (
              <>
                {prayers ? (
                  <ul className="rt-prayers">
                    {PRAYERS.map(([k, name]) => {
                      const at = minOf(prayers[k]);
                      const isNext = nextPrayer?.[0] === k;
                      const prayed = checks.includes(`prayer-${k}`);
                      return (
                        <li key={k} className={`${isNext ? "next" : ""} ${prayed ? "done" : ""}`}>
                          <span>{k === "dhuhr" && new Date().getDay() === 5 ? "Jumu'ah" : name}</span>
                          <b>{clock12(at)}</b>
                          <small>{isNext ? `in ${dur(at - minute)}` : at < minute ? (prayed ? "prayed" : "passed") : ""}</small>
                          <label className="rt-check" title={prayed ? "Prayed — click to undo" : "Mark as prayed"}>
                            <input type="checkbox" checked={prayed} onChange={() => toggle(`prayer-${k}`)} aria-label={`${name} prayed`} />
                            <span />
                          </label>
                        </li>
                      );
                    })}
                    <li className="rt-sunrise">
                      <span>Sunrise</span>
                      <b>{clock12(minOf(prayers.sunrise))}</b>
                    </li>
                  </ul>
                ) : plan.prayer.lat == null ? (
                  <p className="rt-callout">Set your location below to get today's exact prayer times.</p>
                ) : (
                  <p className="rt-callout">Prayer times can't be calculated here today (far north/south) — use your local mosque timetable.</p>
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
                      if (c) setPrayer({ place: c[0], lat: c[1], lng: c[2] }, `Prayer times for ${c[0]}`);
                    }}
                  >
                    <option value="">Pick a city…</option>
                    {CITIES.map(([n]) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <select aria-label="Calculation method" value={plan.prayer.method} onChange={(e) => setPrayer({ method: e.target.value })}>
                    {Object.entries(METHODS).map(([k, m]) => (
                      <option key={k} value={k}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Asr method" value={plan.prayer.asr} onChange={(e) => setPrayer({ asr: e.target.value })}>
                    <option value="hanafi">Asr: Hanafi</option>
                    <option value="shafi">Asr: Shafi'i / Maliki / Hanbali</option>
                  </select>
                  <select aria-label="Time per prayer" value={plan.prayer.minutes} onChange={(e) => setPrayer({ minutes: Number(e.target.value) })}>
                    {[10, 15, 20, 30].map((m) => (
                      <option key={m} value={m}>
                        {m} min per prayer
                      </option>
                    ))}
                  </select>
                </div>
                <p className="small muted">Calculated from the sun's position for your location. Your mosque's timetable may differ by a few minutes — follow your mosque.</p>
              </>
            )}
          </section>

          {/* ---------------------------------------------------------------- balance */}
          <section className="card tinted" style={{ "--c": "#7c3aed" }} aria-labelledby="rt-bal">
            <header className="chart-head">
              <span className="nav-ico">
                <Icon name="pie" size={17} />
              </span>
              <div className="chart-head-text">
                <h3 id="rt-bal">{isToday ? "Today's" : `${WEEK[viewDay]}day's`} balance</h3>
                <p className="small muted">Hours planned per area</p>
              </div>
            </header>
            <div className="pattern-chart">
              <Donut
                size={136}
                segments={hours.map((h) => [h.label, (h.hours / 24) * 100, h.color])}
                center={`${(hours.find((h) => h.key === "coding")?.hours ?? 0).toFixed(1)}h`}
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
          <section className="card tinted" style={{ "--c": "#16a34a" }} aria-labelledby="rt-week">
            <header className="chart-head">
              <span className="nav-ico">
                <Icon name="chart" size={17} />
              </span>
              <div className="chart-head-text">
                <h3 id="rt-week">Last 7 days</h3>
                <p className="small muted">Blocks ticked off per day</p>
              </div>
            </header>
            <div className="rt-week" role="img" aria-label={history.map((h) => `${h.day}: ${h.done} done`).join(", ")}>
              {history.map((h) => {
                const d = new Date(`${h.day}T12:00`);
                return (
                  <div key={h.day} title={`${h.done} done`} className={h.day === today ? "today" : ""}>
                    <b>{h.done}</b>
                    <span style={{ height: `${Math.max(3, Math.min(100, (h.done / Math.max(1, todayBlocks.length)) * 100))}%` }} />
                    <small>{WEEK[d.getDay()]}</small>
                  </div>
                );
              })}
            </div>
            <Switch
              checked={!!plan.reminders}
              onChange={setReminders}
              label="Reminders"
              hint="Spoken reminder + notification when each block or namaz starts (while this tab is open)."
            />
          </section>
        </div>
      </div>

      {form && <BlockForm initial={form} blocks={plan.blocks} onSave={saveBlock} onDelete={setConfirmDel} onClose={() => setForm(null)} />}
      {confirmDel && (
        <ConfirmDelete
          block={confirmDel}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => {
            removeBlock(confirmDel);
            setConfirmDel(null);
          }}
        />
      )}

      {toast && (
        <div className="rt-toast" role="status">
          ✓ {toast.text}
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo();
                setToast(null);
              }}
            >
              <Icon name="undo" size={14} /> Undo
            </button>
          )}
        </div>
      )}
    </>
  );
}
