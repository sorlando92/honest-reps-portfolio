"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ChevronLeft, ChevronRight, Ellipsis } from "lucide-react"
import { Dialog, DropdownMenu } from "radix-ui"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { track } from "@/core/events/client"
import { addDays } from "@/core/time/local-day"
import { daysBetween, fill, formatNumber, longDate, shortDate, weekDates, weekStart, weekdayLetter, type DayTotals } from "../../days/week"
import { Ring } from "./macro-ring"
import { CompactMacroRow, type DayMacros } from "./macro-card"
import { macroCardAway, subscribeMacroCard } from "./header-store"
import { useGoToDay } from "./day-nav"
import { focusNote } from "./today-events"

type Targets = { proteinG: number; carbsG: number; fatG: number; calories: number } | null

const PULL_PX = 50

/** Days by date, filled in as weeks and months load. */
function useDays(initial: DayTotals[]) {
  const [fetched, setDays] = useState(() => new Map<string, DayTotals>())
  const loading = useRef(new Set<string>())
  // Server data for the selected week wins over anything fetched earlier.
  const days = useMemo(() => {
    const merged = new Map(fetched)
    for (const d of initial) merged.set(d.date, d)
    return merged
  }, [fetched, initial])
  const load = useCallback(async (from: string, to: string) => {
    const key = `${from}:${to}`
    if (loading.current.has(key)) return
    loading.current.add(key)
    const res = await fetch(`/api/days?from=${from}&to=${to}`).catch(() => null)
    if (!res?.ok) {
      loading.current.delete(key)
      return
    }
    const rows = (await res.json()) as DayTotals[]
    setDays((prev) => {
      const next = new Map(prev)
      for (const d of rows) if (!next.has(d.date)) next.set(d.date, d)
      return next
    })
  }, [])
  return { days, load }
}

/** "Wednesday October 15, 1,840 of 2,100 calories, selected" (NAV_SPEC Accessibility). */
function dayLabel(date: string, d: DayTotals | undefined, selected: boolean, today: string): string {
  const name = longDate(date).replace(",", "")
  const cal = date > today || !d ? "" : d.target ? `, ${formatNumber(d.calories)} of ${formatNumber(d.target.calories)} calories` : `, ${formatNumber(d.calories)} calories`
  return `${name}${cal}${selected ? ", selected" : ""}`
}

/** One day: weekday letter (optional), the date inside its calorie ring, selected outline, today dot. */
function DayCell({ date, d, selected, today, letter, onPick }: { date: string; d: DayTotals | undefined; selected: boolean; today: string; letter: boolean; onPick: (date: string) => void }) {
  const future = date > today
  return (
    <button
      type="button"
      disabled={future}
      aria-label={dayLabel(date, d, selected, today)}
      aria-current={selected ? "date" : undefined}
      onClick={() => onPick(date)}
      className={cn(
        "flex min-h-11 min-w-11 flex-col items-center gap-0.5 rounded-lg border px-1 py-1 disabled:opacity-35",
        selected ? "border-text" : "border-transparent"
      )}
    >
      {letter && (
        <span aria-hidden className="text-label text-text-muted">
          {weekdayLetter(date)}
        </span>
      )}
      <span aria-hidden className="relative flex items-center justify-center">
        <Ring macro="calories" value={future || !d ? 0 : fill(d.calories, d.target?.calories)} size={34} stroke={3} />
        <span className="absolute text-caption font-semibold tabular-nums">{Number(date.slice(8))}</span>
      </span>
      <span aria-hidden className={cn("size-1 rounded-full", date === today ? "bg-text" : "bg-transparent")} />
    </button>
  )
}

/**
 * The pinned header band on Today (NAV_SPEC 4): the title row, then the
 * sliding week strip, which crossfades to the compact macro row while the
 * macro card is scrolled away, and the month calendar that slides down.
 */
export function HeaderBand({
  date,
  today,
  firstWeek,
  week,
  day,
  target,
}: {
  date: string
  today: string
  /** Monday of the account's first week; the strip slides back to it. */
  firstWeek: string
  week: DayTotals[]
  day: DayMacros
  target: Targets
}) {
  const go = useGoToDay(today, date)
  const { days, load } = useDays(week)
  const [open, setOpen] = useState(false)
  const away = useSyncExternalStore(subscribeMacroCard, macroCardAway, () => false)
  const isToday = date === today
  const calendarId = useId()

  function toggleCalendar(next = !open) {
    setOpen(next)
    if (next) track("calendar_expanded")
  }

  return (
    <>
      <header
        id="today-band"
        className="sticky top-0 z-30 -mx-4 -mt-[env(safe-area-inset-top)] bg-band px-4 pt-[env(safe-area-inset-top)]"
      >
        <TitleRow date={date} today={today} isToday={isToday} open={open} calendarId={calendarId} onTitle={() => toggleCalendar()} go={go} />
        <div className="grid">
          <div
            className={cn("col-start-1 row-start-1 transition-[opacity,visibility] duration-200 motion-reduce:transition-none", away && !open ? "pointer-events-none invisible opacity-0" : "visible opacity-100")}
            inert={away && !open ? true : undefined}
          >
            <WeekSlider date={date} today={today} firstWeek={firstWeek} days={days} load={load} onPick={go} onPullDown={() => toggleCalendar(true)} />
          </div>
          <div
            className={cn("col-start-1 row-start-1 self-center transition-[opacity,visibility] duration-200 motion-reduce:transition-none", away && !open ? "visible opacity-100" : "pointer-events-none invisible opacity-0")}
            inert={away && !open ? undefined : true}
          >
            <CompactMacroRow day={day} target={target} />
          </div>
        </div>
        <div
          id={calendarId}
          className={cn("grid transition-[grid-template-rows] duration-250 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
        >
          <div className="overflow-hidden" inert={open ? undefined : true}>
            {open && (
              <MonthCalendar
                date={date}
                today={today}
                firstWeek={firstWeek}
                days={days}
                load={load}
                onPick={(d) => {
                  setOpen(false)
                  go(d)
                }}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        </div>
      </header>
      {/* Tap outside collapses the calendar. */}
      {open && <div aria-hidden className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}
    </>
  )
}

function TitleRow({
  date,
  today,
  isToday,
  open,
  calendarId,
  onTitle,
  go,
}: {
  date: string
  today: string
  isToday: boolean
  open: boolean
  calendarId: string
  onTitle: () => void
  go: (d: string) => void
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="relative flex h-14 items-center justify-center">
      <div className="flex items-center">
        <Button variant="text" size="icon" aria-label={`Previous day, ${longDate(addDays(date, -1))}`} onClick={() => go(addDays(date, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <h1 className="text-title">
          <button
            type="button"
            onClick={onTitle}
            aria-expanded={open}
            aria-controls={calendarId}
            aria-label={`${isToday ? `Today, ${longDate(date)}` : longDate(date)}. ${open ? "Close" : "Open"} the month calendar`}
            className="min-h-11 px-1"
          >
            {isToday ? "Today" : shortDate(date)}
          </button>
        </h1>
        <Button variant="text" size="icon" aria-label={isToday ? "Next day" : `Next day, ${longDate(addDays(date, 1))}`} disabled={isToday} onClick={() => go(addDays(date, 1))}>
          <ChevronRight aria-hidden />
        </Button>
      </div>
      {!isToday && (
        <Button variant="text" className="absolute left-0 h-11 px-2" onClick={() => go(today)}>
          Today
        </Button>
      )}
      <span className="absolute right-0">
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <Button variant="text" size="icon" aria-label="More for this day">
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-40 rounded-lg border border-border bg-bg p-1">
              {[
                { label: "Go to date", run: () => setPicking(true) },
                { label: "Day note", run: focusNote },
              ].map((item) => (
                <DropdownMenu.Item
                  key={item.label}
                  onSelect={item.run}
                  className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-body outline-none data-[highlighted]:bg-surface"
                >
                  {item.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </span>
      {picking && <GoToDate open={picking} onOpenChange={setPicking} date={date} today={today} onGo={go} />}
    </div>
  )
}

/**
 * Whole weeks side by side with native momentum and snap (NAV_SPEC 4).
 * Swiping never changes the selected day; tapping does. Weeks load as they
 * come into view. Pulling down opens the month calendar.
 */
function WeekSlider({
  date,
  today,
  firstWeek,
  days,
  load,
  onPick,
  onPullDown,
}: {
  date: string
  today: string
  firstWeek: string
  days: Map<string, DayTotals>
  load: (from: string, to: string) => Promise<void>
  onPick: (date: string) => void
  onPullDown: () => void
}) {
  const current = weekStart(today)
  const weeks = useMemo(() => Array.from({ length: Math.max(1, daysBetween(firstWeek, current) / 7 + 1) }, (_, i) => addDays(firstWeek, i * 7)), [firstWeek, current])
  const selectedIndex = Math.max(0, weeks.indexOf(weekStart(date)))
  const scroller = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(selectedIndex)
  const touch = useRef<{ x: number; y: number } | null>(null)

  // Show the selected day's week, without animation, whenever it changes.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = selectedIndex * el.clientWidth
  }, [selectedIndex])

  useEffect(() => {
    const monday = weeks[index]
    if (monday && !days.has(monday)) void load(monday, addDays(monday, 6))
  }, [index, weeks, days, load])

  function scrollToWeek(i: number) {
    const el = scroller.current
    if (!el) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? "auto" : "smooth" })
  }

  return (
    <div
      className="relative pb-1"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchMove={(e) => {
        const t = touch.current
        if (!t) return
        const dy = e.touches[0].clientY - t.y
        if (dy > PULL_PX && Math.abs(e.touches[0].clientX - t.x) < PULL_PX / 2) {
          touch.current = null
          onPullDown()
        }
      }}
      onTouchEnd={() => (touch.current = null)}
    >
      <div
        ref={scroller}
        role="group"
        aria-label="Week"
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {weeks.map((monday) => (
          <ul key={monday} className="grid w-full shrink-0 snap-start snap-always grid-cols-7">
            {weekDates(monday).map((d) => (
              <li key={d} className="flex justify-center">
                <DayCell date={d} d={days.get(d)} selected={d === date} today={today} letter onPick={onPick} />
              </li>
            ))}
          </ul>
        ))}
      </div>
      {/* NAV_SPEC Accessibility: the swipe also has buttons, shown when focused. */}
      <Button
        variant="secondary"
        size="icon"
        aria-label="Previous week"
        disabled={index === 0}
        onClick={() => scrollToWeek(index - 1)}
        className="sr-only focus:not-sr-only focus:absolute focus:top-1 focus:left-0 focus:z-10"
      >
        <ChevronLeft aria-hidden />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        aria-label="Next week"
        disabled={index >= weeks.length - 1}
        onClick={() => scrollToWeek(index + 1)}
        className="sr-only focus:not-sr-only focus:absolute focus:top-1 focus:right-0 focus:z-10"
      >
        <ChevronRight aria-hidden />
      </Button>
    </div>
  )
}

const monthFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" })

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}
function addMonths(first: string, n: number): string {
  const [y, m] = first.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

/**
 * A month grid, Monday first, with the same rings, today dot, selected
 * outline and dimmed future days. ‹ › and swipe change months; tapping a day
 * selects it; pulling up closes (NAV_SPEC 4).
 */
function MonthCalendar({
  date,
  today,
  firstWeek,
  days,
  load,
  onPick,
  onClose,
}: {
  date: string
  today: string
  firstWeek: string
  days: Map<string, DayTotals>
  load: (from: string, to: string) => Promise<void>
  onPick: (date: string) => void
  onClose: () => void
}) {
  const [month, setMonth] = useState(monthStart(date))
  const touch = useRef<{ x: number; y: number } | null>(null)
  const last = addDays(addMonths(month, 1), -1)
  const lead = (new Date(`${month}T12:00:00Z`).getUTCDay() + 6) % 7
  const dates = Array.from({ length: daysBetween(month, last) + 1 }, (_, i) => addDays(month, i))
  const canPrev = month > monthStart(firstWeek)
  const canNext = month < monthStart(today)

  useEffect(() => {
    void load(month, last > today ? today : last)
  }, [month, last, today, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="flex flex-col gap-1 pt-1 pb-3"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current
        touch.current = null
        if (!t) return
        const dx = e.changedTouches[0].clientX - t.x
        const dy = e.changedTouches[0].clientY - t.y
        if (dy < -PULL_PX && Math.abs(dx) < Math.abs(dy)) return onClose()
        if (Math.abs(dx) > PULL_PX && Math.abs(dy) < Math.abs(dx)) {
          if (dx > 0 && canPrev) setMonth(addMonths(month, -1))
          if (dx < 0 && canNext) setMonth(addMonths(month, 1))
        }
      }}
    >
      <div className="flex items-center justify-between">
        <Button variant="text" size="icon" aria-label="Previous month" disabled={!canPrev} onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <h2 className="text-headline" aria-live="polite">
          {monthFormat.format(new Date(`${month}T12:00:00Z`))}
        </h2>
        <Button variant="text" size="icon" aria-label="Next month" disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <div aria-hidden className="grid grid-cols-7 text-center text-label text-text-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <ul aria-label="Month" className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: lead }, (_, i) => (
          <li key={`blank-${i}`} aria-hidden />
        ))}
        {dates.map((d) => (
          <li key={d} className="flex justify-center">
            <DayCell date={d} d={days.get(d)} selected={d === date} today={today} letter={false} onPick={onPick} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function GoToDate({ open, onOpenChange, date, today, onGo }: { open: boolean; onOpenChange: (o: boolean) => void; date: string; today: string; onGo: (d: string) => void }) {
  const id = useId()
  const [value, setValue] = useState(date)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70" />
        <Dialog.Content className="fixed inset-x-4 top-1/3 z-50 mx-auto flex max-w-sm flex-col gap-3 rounded-lg border border-border bg-bg p-4">
          <Dialog.Title className="text-headline">Go to date</Dialog.Title>
          <Dialog.Description className="sr-only">Pick a day up to today.</Dialog.Description>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!valid) return
              onOpenChange(false)
              onGo(value)
            }}
          >
            <label htmlFor={id} className="text-label text-text-muted uppercase">
              Date
            </label>
            <input id={id} type="date" max={today} value={value} onChange={(e) => setValue(e.target.value)} className="h-12 rounded-md border border-border bg-surface px-3 text-body" />
            <Button type="submit" disabled={!valid}>
              Go
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
