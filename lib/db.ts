import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { OrderItem } from "./order";

// Netlify Functions are stateless/short-lived, so we cache the Pool on the
// global object to avoid opening a fresh connection (and exhausting Neon's
// connection limit) on every invocation within the same warm container.
declare global {
  // eslint-disable-next-line no-var
  var __cookieOrderPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
  return new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPool(): Pool {
  if (!global.__cookieOrderPool) {
    global.__cookieOrderPool = createPool();
  }
  return global.__cookieOrderPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query<T>(text, params);
  return result.rows;
}

// ---- Order row shape as stored in Postgres ----
export type OrderStatus =
  | "pending_stripe"
  | "pending_etransfer"
  | "paid"
  | "cancelled"
  | "expired";

export interface OrderRow {
  id: string;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_notes: string | null;
  items: OrderItem[];
  total_cookies: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  week_start: string;
  pickup_location: string;
  payment_method: "stripe" | "etransfer";
  status: OrderStatus;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  confirmation_email_sent_at: string | null;
  admin_confirmed_by: string | null;
  admin_confirmed_at: string | null;
  admin_cancelled_by: string | null;
  admin_cancelled_at: string | null;
}

export async function getOrderById(id: string): Promise<OrderRow | undefined> {
  const rows = await query<OrderRow>("SELECT * FROM orders WHERE id = $1", [id]);
  return rows[0];
}

export async function getOrderByStripeSessionId(sessionId: string): Promise<OrderRow | undefined> {
  const rows = await query<OrderRow>("SELECT * FROM orders WHERE stripe_session_id = $1", [sessionId]);
  return rows[0];
}

/**
 * Runs `fn` inside a transaction holding a Postgres advisory lock scoped to
 * `weekStart`. This is what makes the weekly cap race-condition-safe: two
 * customers submitting orders for the same week at the same instant are
 * serialized against each other (one waits for the other's transaction to
 * commit before its own cap check runs), while orders for *different* weeks
 * never block each other. The lock is automatically released when the
 * transaction ends (commit or rollback), even if the connection drops.
 */
export async function withWeeklyCapLock<T>(
  weekStart: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [weekStart]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface InsertOrderInput {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerNotes?: string;
  items: OrderItem[];
  totalCookies: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  weekStart: string;
  pickupLocation: string;
  paymentMethod: "stripe" | "etransfer";
  status: OrderStatus;
}

export async function insertOrder(client: PoolClient, input: InsertOrderInput): Promise<OrderRow> {
  const result = await client.query<OrderRow>(
    `INSERT INTO orders (
       id, customer_name, customer_email, customer_phone, customer_notes,
       items, total_cookies, subtotal_cents, tax_cents, total_cents,
       week_start, pickup_location, payment_method, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      input.id,
      input.customerName,
      input.customerEmail,
      input.customerPhone || null,
      input.customerNotes || null,
      JSON.stringify(input.items),
      input.totalCookies,
      input.subtotalCents,
      input.taxCents,
      input.totalCents,
      input.weekStart,
      input.pickupLocation,
      input.paymentMethod,
      input.status,
    ]
  );
  return result.rows[0];
}

export async function setOrderStripeSession(
  client: PoolClient,
  orderId: string,
  stripeSessionId: string
): Promise<void> {
  await client.query(
    `UPDATE orders SET stripe_session_id = $2, updated_at = now() WHERE id = $1`,
    [orderId, stripeSessionId]
  );
}

export async function markOrderPaid(
  orderId: string,
  stripePaymentIntentId: string | null
): Promise<OrderRow | undefined> {
  const rows = await query<OrderRow>(
    `UPDATE orders
     SET status = 'paid', stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id), updated_at = now()
     WHERE id = $1 AND status <> 'paid'
     RETURNING *`,
    [orderId, stripePaymentIntentId]
  );
  return rows[0];
}

export async function markOrderPaidByStripeSession(
  stripeSessionId: string,
  stripePaymentIntentId: string | null
): Promise<OrderRow | undefined> {
  const rows = await query<OrderRow>(
    `UPDATE orders
     SET status = 'paid', stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id), updated_at = now()
     WHERE stripe_session_id = $1 AND status <> 'paid'
     RETURNING *`,
    [stripeSessionId, stripePaymentIntentId]
  );
  return rows[0];
}

export async function markOrderConfirmedByAdmin(
  orderId: string,
  adminUser: string
): Promise<OrderRow | undefined> {
  const rows = await query<OrderRow>(
    `UPDATE orders
     SET status = 'paid', admin_confirmed_by = $2, admin_confirmed_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending_etransfer'
     RETURNING *`,
    [orderId, adminUser]
  );
  return rows[0];
}

export async function markOrderCancelledByAdmin(
  orderId: string,
  adminUser: string
): Promise<OrderRow | undefined> {
  const rows = await query<OrderRow>(
    `UPDATE orders
     SET status = 'cancelled', admin_cancelled_by = $2, admin_cancelled_at = now(), updated_at = now()
     WHERE id = $1 AND status IN ('pending_etransfer', 'pending_stripe')
     RETURNING *`,
    [orderId, adminUser]
  );
  return rows[0];
}

export async function markConfirmationEmailSent(orderId: string): Promise<void> {
  await query(`UPDATE orders SET confirmation_email_sent_at = now() WHERE id = $1`, [orderId]);
}

export async function listRecentOrders(limit = 100): Promise<OrderRow[]> {
  return query<OrderRow>(`SELECT * FROM orders ORDER BY created_at DESC LIMIT $1`, [limit]);
}

export async function listAllOrders(): Promise<OrderRow[]> {
  return query<OrderRow>(`SELECT * FROM orders ORDER BY created_at DESC`);
}