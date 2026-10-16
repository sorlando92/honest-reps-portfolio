// Local days in the user's profile timezone. Every "which day is this" rule
// (Today, daily totals, adherence, logging-day counts, evening nudge, weekly
// cycle) goes through here, never through the server's or the browser's clock
// zone. A local date is "YYYY-MM-DD".

const dateFormats = new Map<string, Intl.DateTimeFormat>()
const partFormats = new Map<string, Intl.DateTimeFormat>()

function dateFormat(timezone: string): Intl.DateTimeFormat {
  let f = dateFormats.get(timezone)
  if (!f) {
    // en-CA formats as YYYY-MM-DD.
    f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    dateFormats.set(timezone, f)
  }
  return f
}

/** The local date of an instant in a timezone. */
export function localDate(instant: Date | string, timezone: string): string {
  return dateFormat(timezone).format(new Date(instant))
}

/** Today's local date in a timezone. */
export function localToday(timezone: string, now: Date = new Date()): string {
  return localDate(now, timezone)
}

/** The local date n days after (or before) a local date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = parse(date)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * The instants a local day covers: start inclusive, end exclusive. Days are
 * 23 or 25 hours long when daylight saving time starts or ends.
 */
export function dayBounds(date: string, timezone: string): { start: Date; end: Date } {
  return { start: startOfDay(date, timezone), end: startOfDay(addDays(date, 1), timezone) }
}

/** True when the timezone is one the runtime (and Postgres) knows. */
export function isValidTimezone(timezone: string): boolean {
  try {
    dateFormat(timezone)
    return true
  } catch {
    return false
  }
}

function startOfDay(date: string, timezone: string): Date {
  const [y, m, d] = parse(date)
  const midnightAsUtc = Date.UTC(y, m - 1, d)
  // Shift by the zone's offset, then once more in case the offset differs at
  // the shifted instant (a daylight saving change near midnight).
  let start = midnightAsUtc - offsetMs(midnightAsUtc, timezone)
  const corrected = midnightAsUtc - offsetMs(start, timezone)
  if (corrected !== start) start = corrected
  return new Date(start)
}

/** How far the timezone's wall clock is ahead of UTC at an instant. */
function offsetMs(instant: number, timezone: string): number {
  let f = partFormats.get(timezone)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
    partFormats.set(timezone, f)
  }
  const p = Object.fromEntries(f.formatToParts(new Date(instant)).map((x) => [x.type, Number(x.value)]))
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wall - Math.floor(instant / 1000) * 1000
}

function parse(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Not a local date: ${date}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * The instant a local wall clock time ("HH:MM") on a local date names in a
 * timezone. A time skipped by a daylight saving change lands an hour later.
 */
export function localInstant(date: string, time: string, timezone: string): Date {
  const [y, m, d] = parse(date)
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) throw new Error(`Not a local time: ${time}`)
  const wall = Date.UTC(y, m - 1, d, Number(match[1]), Number(match[2]))
  let instant = wall - offsetMs(wall, timezone)
  const corrected = wall - offsetMs(instant, timezone)
  if (corrected !== instant) instant = corrected
  return new Date(instant)
}

/** The local wall clock time ("HH:MM") of an instant in a timezone. */
export function localTime(instant: Date | string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant))
}
