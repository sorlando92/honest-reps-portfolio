"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { cn } from "cn"
import { track } from "@/core/events/client"
import { formatNumber, isStreakMilestone, shortDate, type DayTotals } from "../../days/week"
import { MACRO_LABEL, MacroRing, Ring, macroSentence, type Macro, type MacroMode } from "./macro-ring"
import { fill } from "../../days/week"

const MACROS: Macro[] = ["protein", "carbs", "fat", "calories"]
const MODE_KEY = "hr:macro-mode"
const MODE_CHANGED = "hr:macro-mode-changed"
const MOMENT_KEY = "hr:streak-moment"

export interface DayMacros {
  proteinG: number
  carbsG: number
  fatG: number
  calories: number
}

type Targets = { proteinG: number; carbsG: number; fatG: number; calories: number } | null

function eatenOf(day: DayMacros, macro: Macro): number {
  return macro === "protein" ? day.proteinG : macro === "carbs" ? day.carbsG : macro === "fat" ? day.fatG : day.calories
}

function targetOf(target: Targets, macro: Macro): number | null {
  if (!target) return null
  return macro === "protein" ? target.proteinG : macro === "carbs" ? target.carbsG : macro === "fat" ? target.fatG : target.calories
}

// Eaten or Left, remembered on the device (docs/SCREENS_V2.md Today 3).
function readMode(): MacroMode {
  try {
    return localStorage.getItem(MODE_KEY) === "left" ? "left" : "eaten"
  } catch {
    return "eaten"
  }
}
function subscribeMode(onChange: () => void) {
  window.addEventListener(MODE_CHANGED, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(MODE_CHANGED, onChange)
    window.removeEventListener("storage", onChange)
  }
}
function writeMode(mode: MacroMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Storage blocked: the toggle still works until the page reloads.
  }
  window.dispatchEvent(new Event(MODE_CHANGED))
}

/**
 * The macro card (DESIGN_SYSTEM.md "Macro card"): page 1 has 4 rings, tap
 * to switch Eaten and Left; page 2 has the week insight, mini bars and the
 * streak. Once it scrolls away, a compact header pins to the top.
 */
export function MacroCard({
  day,
  target,
  week,
  insight,
  streak,
  date,
  today,
}: {
  day: DayMacros
  target: Targets
  week: DayTotals[]
  insight: string | null
  streak: number
  date: string
  today: string
}) {
  const stored = useSyncExternalStore(subscribeMode, readMode, () => "eaten" as MacroMode)
  const [fallbackMode, setFallbackMode] = useState<MacroMode | null>(null)
  const mode = fallbackMode ?? stored
  const [page, setPage] = useState(0)
  const pages = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLElement>(null)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    const el = card.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  function toggleMode() {
    if (!target) return
    const next: MacroMode = mode === "eaten" ? "left" : "eaten"
    writeMode(next)
    setFallbackMode(readMode() === next ? null : next)
    track("macro_card_mode_changed", { mode: next })
  }

  function showPage(i: number) {
    const el = pages.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }

  return (
    <>
      <section ref={card} aria-label="Macros" className="rounded-lg bg-surface">
        <div
          ref={pages}
          onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-full shrink-0 snap-start flex-col justify-center p-4">
            <button
              type="button"
              onClick={toggleMode}
              aria-label={target ? `Macros, showing ${mode === "eaten" ? "eaten" : "left"}. Tap to show ${mode === "eaten" ? "left" : "eaten"}.` : "Macros eaten"}
              aria-disabled={!target}
              className="grid w-full grid-cols-4 gap-1"
            >
              {MACROS.map((m) => (
                <MacroRing key={m} macro={m} eaten={eatenOf(day, m)} target={targetOf(target, m)} mode={mode} />
              ))}
            </button>
            {!target && <p className="mt-3 text-center text-caption text-text-muted">Set your targets</p>}
          </div>
          <div className="w-full shrink-0 snap-start p-4">
            <WeekPage week={week} insight={insight} streak={streak} today={today} />
          </div>
        </div>
        <div className="-mt-2 flex justify-center">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              aria-label={i === 0 ? "Show macros" : "Show this week"}
              aria-current={page === i ? "true" : undefined}
              onClick={() => showPage(i)}
              className="flex size-11 items-center justify-center"
            >
              <span aria-hidden className={cn("size-2 rounded-full", page === i ? "bg-text" : "bg-border")} />
            </button>
          ))}
        </div>
      </section>
      <StreakMoment streak={streak} active={date === today} today={today} />
      {pinned && <CompactHeader day={day} target={target} />}
    </>
  )
}

/** One line of 4 small rings with "eaten of target" (DESIGN_SYSTEM.md "Sticky compact header"). */
function CompactHeader({ day, target }: { day: DayMacros; target: Targets }) {
  return (
    <div className="fixed inset-x-0 top-0 z-30 border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
      <ul aria-label="Macros" className="mx-auto grid max-w-[720px] grid-cols-4 gap-1 px-4 py-2">
        {MACROS.map((m) => {
          const eaten = eatenOf(day, m)
          const t = targetOf(target, m)
          return (
            <li key={m} className="flex items-center gap-1.5" aria-label={macroSentence(m, eaten, t)}>
              <Ring macro={m} value={fill(eaten, t)} size={20} stroke={3} />
              <span aria-hidden className="text-caption tabular-nums">
                {formatNumber(eaten)}
                {t !== null && <span className="text-text-muted"> of {formatNumber(t)}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Week insight, 7 mini bars of calories against target with protein markers, and the streak. */
function WeekPage({ week, insight, streak, today }: { week: DayTotals[]; insight: string | null; streak: number; today: string }) {
  const max = Math.max(1, ...week.map((d) => Math.max(d.calories, d.target?.calories ?? 0))) * 1.1
  const h = 72
  const summary = week
    .filter((d) => d.date <= today)
    .map((d) => `${shortDate(d.date)}: ${d.logged ? `${formatNumber(d.calories)} calories${d.proteinHit ? ", protein hit" : ""}` : "not logged"}`)
    .join(". ")
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-text-muted">{insight ?? "Log a meal to see your week."}</p>
      <div role="img" aria-label={summary ? `This week by day. ${summary}.` : "This week by day: nothing logged yet."}>
        <svg viewBox={`0 0 140 ${h + 8}`} className="h-14 w-full" preserveAspectRatio="none" aria-hidden>
          {week.map((d, i) => {
            const x = i * 20 + 4
            const bar = (d.calories / max) * h
            const line = d.target ? h + 8 - (d.target.calories / max) * h : null
            return (
              <g key={d.date}>
                <rect x={x} y={h + 8 - bar} width={12} height={bar} rx={2} className="fill-macro-calories" />
                {line !== null && d.date <= today && (
                  <line x1={x - 2} x2={x + 14} y1={line} y2={line} strokeDasharray="2 2" strokeWidth={1} className="stroke-text-muted" />
                )}
                {d.proteinHit && <circle cx={x + 6} cy={3} r={2} className="fill-macro-protein" />}
              </g>
            )
          })}
        </svg>
        <div aria-hidden className="grid grid-cols-7 text-center text-caption text-text-muted">
          {week.map((d) => (
            <span key={d.date}>{shortDate(d.date).charAt(0)}</span>
          ))}
        </div>
      </div>
      <p className="text-headline tabular-nums">{streak > 0 ? `${streak} day streak` : "Start a streak today"}</p>
      <p className="sr-only">Protein days are marked with a dot above the bar. {MACRO_LABEL.calories} target shown as a dashed line.</p>
    </div>
  )
}

/**
 * Earned moment at 7, 14, 30, 60 and 100 day streaks (docs/TODAY_SPEC.md 4):
 * an accent pulse and one line, at most once per day, on today only.
 */
function StreakMoment({ streak, active, today }: { streak: number; active: boolean; today: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!active || !isStreakMilestone(streak)) return
    const key = `${today}:${streak}`
    try {
      if (localStorage.getItem(MOMENT_KEY) === key) return
      localStorage.setItem(MOMENT_KEY, key)
    } catch {
      return
    }
    track("streak_milestone", { days: streak })
    const frame = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(frame)
  }, [active, streak, today])
  if (!show) return null
  return (
    <p role="status" className="rounded-lg border border-accent-strong px-4 py-3 text-headline motion-safe:animate-pulse motion-safe:[animation-iteration-count:2]">
      {streak} days straight. That&rsquo;s the habit.
    </p>
  )
}
