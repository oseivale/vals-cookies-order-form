import type { PoolClient } from "pg";
import { getPool, query } from "./db";
import { CAP_TIMEZONE, WEEKLY_COOKIE_CAP } from "./config";

// Minimal shape shared by pg's Pool and PoolClient — lets the same query
// helper run either against the shared pool or against a client that's
// mid-transaction (holding the weekly advisory lock).
interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ total: string | null }> }>;
}

// A "pending_stripe" order (customer clicked "Pay with Stripe" but hasn't
// finished checkout yet) reserves cookies against the cap for a limited
// window so two customers can't both be told there's room for the last box.
// After this window it's treated as abandoned and no longer reserves stock.
export const STALE_PENDING_MINUTES = 30;

/**
 * Returns the Monday (as "YYYY-MM-DD") that starts the current week, using
 * calendar dates in America/Toronto — the bakery's local week, regardless of
 * what timezone a customer is browsing from. Pure calendar-date arithmetic
 * (no timezone-aware instant math), so it's unaffected by DST transitions.
 */
export function getTorontoWeekStart(now: Date = new Date()): string {
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekdayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAP_TIMEZONE,
    weekday: "short",
  });

  const todayStr = dateFmt.format(now); // "YYYY-MM-DD"
  const weekdayStr = weekdayFmt.format(now); // "Mon", "Tue", ...

  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayStr);
  const daysSinceMonday = weekdayIndex === -1 ? 0 : weekdayIndex;

  const [y, m, d] = todayStr.split("-").map(Number);
  const anchorUtc = Date.UTC(y, m - 1, d) - daysSinceMonday * 86_400_000;
  const monday = new Date(anchorUtc);

  const yyyy = monday.getUTCFullYear();
  const mm = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(monday.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Marks pending_stripe orders older than STALE_PENDING_MINUTES as expired so
 * they stop reserving cookies against the weekly cap. Safe to call
 * frequently — it's a plain conditional UPDATE.
 */
export async function expireStalePendingStripeOrders(): Promise<void> {
  await query(
    `UPDATE orders
     SET status = 'expired', updated_at = now()
     WHERE status = 'pending_stripe'
       AND created_at < now() - ($1 || ' minutes')::interval`,
    [STALE_PENDING_MINUTES]
  );
}

export interface CapStatus {
  weekStart: string;
  cap: number;
  committed: number;
  remaining: number;
}

const COMMITTED_COOKIES_SQL = `SELECT COALESCE(SUM(total_cookies), 0) AS total
     FROM orders
     WHERE week_start = $1
       AND (
         status = 'paid'
         OR status = 'pending_etransfer'
         OR (status = 'pending_stripe' AND created_at >= now() - ($2 || ' minutes')::interval)
       )`;

async function committedCookiesForWeek(executor: Queryable, weekStart: string): Promise<number> {
  const result = await executor.query(COMMITTED_COOKIES_SQL, [weekStart, STALE_PENDING_MINUTES]);
  return Number(result.rows[0]?.total ?? 0);
}

/**
 * Cookies that currently count against this week's cap: paid orders, all
 * pending e-Transfer orders (they need a human to confirm or cancel them),
 * and pending Stripe orders still inside the abandonment window.
 */
export async function getCapStatus(now: Date = new Date()): Promise<CapStatus> {
  await expireStalePendingStripeOrders();

  const weekStart = getTorontoWeekStart(now);
  const committed = await committedCookiesForWeek(getPool(), weekStart);
  return {
    weekStart,
    cap: WEEKLY_COOKIE_CAP,
    committed,
    remaining: Math.max(0, WEEKLY_COOKIE_CAP - committed),
  };
}

export async function hasRoomFor(requestedCookies: number, now: Date = new Date()): Promise<{
  ok: boolean;
  status: CapStatus;
}> {
  const status = await getCapStatus(now);
  return { ok: requestedCookies <= status.remaining, status };
}

/**
 * Same cap check as `hasRoomFor`, but run against a client already holding
 * the per-week advisory lock (see `withWeeklyCapLock` in lib/db.ts) so the
 * check-then-insert is atomic across concurrent requests for the same week.
 * Does NOT call `expireStalePendingStripeOrders` — that's a maintenance
 * sweep, not something that needs to happen inside every locked write.
 */
export async function hasRoomForLocked(
  client: PoolClient,
  weekStart: string,
  requestedCookies: number
): Promise<{ ok: boolean; committed: number; remaining: number }> {
  const committed = await committedCookiesForWeek(client, weekStart);
  const remaining = Math.max(0, WEEKLY_COOKIE_CAP - committed);
  return { ok: requestedCookies <= remaining, committed, remaining };
}
