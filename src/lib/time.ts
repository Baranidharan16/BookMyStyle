/**
 * Time-zone-safe helpers. Instants are always JS Dates (UTC internally);
 * wall-clock values are expressed in an explicit IANA zone. Works for any
 * zone (DST included) — the platform defaults to Asia/Kolkata.
 */
export const DEFAULT_TZ = "Asia/Kolkata";

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

export function zonedParts(date: Date, tz: string = DEFAULT_TZ): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    year: +get("year"),
    month: +get("month"),
    day: +get("day"),
    hour: +get("hour"),
    minute: +get("minute"),
    second: +get("second"),
    weekday: WEEKDAYS[get("weekday")]!,
  };
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffsetMs(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to an instant. `date` is "YYYY-MM-DD", `minutes` from midnight. */
export function zonedToUtc(date: string, minutes: number, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minutes, 0);
  // two-pass correction handles DST transitions
  let offset = tzOffsetMs(new Date(guess), tz);
  let result = guess - offset;
  const offset2 = tzOffsetMs(new Date(result), tz);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset;
  }
  return new Date(result);
}

/** "YYYY-MM-DD" for the instant in `tz`. */
export function toDateKey(date: Date, tz: string = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function minutesOfDay(date: Date, tz: string = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

export function weekdayOf(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function isValidDateKey(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 1050 -> "5:30 PM" */
export function formatMinutes(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "17:30" -> 1050 */
export function parseHHMM(s: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = +m[1]!, mm = +m[2]!;
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) return null;
  return h * 60 + mm;
}

export function toHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DateOpts = { weekday?: "short" | "long" | undefined; day?: "numeric" | undefined; month?: "short" | "long" | undefined; year?: "numeric" | undefined };

/**
 * Deterministic date formatting (no Intl locale data), so server-rendered
 * and hydrated output always match regardless of ICU version.
 * Output style (en-IN): "Fri, 2 Oct 2026" / "Friday, 2 October 2026".
 */
function composeDate(p: { year: number; month: number; day: number; weekday: number }, o: DateOpts) {
  const opts: DateOpts = { weekday: "short", day: "numeric", month: "short", year: undefined, ...o };
  const parts: string[] = [];
  if (opts.day) parts.push(String(p.day));
  if (opts.month) parts.push(opts.month === "long" ? MONTH_LONG[p.month - 1]! : MONTH_SHORT[p.month - 1]!);
  if (opts.year) parts.push(String(p.year));
  const body = parts.join(" ");
  if (!opts.weekday) return body;
  const wd = opts.weekday === "long" ? WD_LONG[p.weekday]! : WD_SHORT[p.weekday]!;
  return body ? `${wd}, ${body}` : wd;
}

export function formatTime(date: Date | string, tz: string = DEFAULT_TZ) {
  const p = zonedParts(new Date(date), tz);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, "0")} ${p.hour >= 12 ? "pm" : "am"}`;
}

export function formatDate(date: Date | string, tz: string = DEFAULT_TZ, opts: DateOpts = {}) {
  return composeDate(zonedParts(new Date(date), tz), opts);
}

export function formatDateKey(dateKey: string, opts: DateOpts = {}) {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return composeDate({ year: y, month: m, day: d, weekday: weekdayOf(dateKey) }, opts);
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}
