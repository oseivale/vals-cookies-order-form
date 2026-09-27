// Preorders are open Sunday 00:00 through Wednesday 23:59 (America/Toronto
// time) for pickup that same week — closed Thursday through Saturday while
// that week's batch is baked and picked up. All checks are done in Toronto
// time regardless of where the server actually runs, the same principle
// already used for the weekly cookie cap.

const TIMEZONE = "America/Toronto";

function torontoWeekday(date: Date): number {
  // 0 = Sunday ... 6 = Saturday, matching Date.getDay()'s convention.
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).formatToParts(date);
  const weekdayPart = parts.find((p) => p.type === "weekday")!.value;
  return weekdayMap[weekdayPart];
}

export function isOrderWindowOpen(now: Date = new Date()): boolean {
  // Manual override for local testing, e.g. ORDER_WINDOW_OVERRIDE=closed in
  // .env, so you don't have to wait for an actual Thursday to see the closed
  // page. Never set this in production.
  if (process.env.ORDER_WINDOW_OVERRIDE === "open") return true;
  if (process.env.ORDER_WINDOW_OVERRIDE === "closed") return false;

  const weekday = torontoWeekday(now);
  return weekday >= 0 && weekday <= 3; // Sunday(0) through Wednesday(3)
}