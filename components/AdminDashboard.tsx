"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND, TAX_LABEL, formatCents } from "@/lib/config";
import { orderItemsSummary } from "@/lib/order";
import type { OrderItem } from "@/lib/order";

export interface AdminOrder {
  id: string;
  created_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  items: OrderItem[];
  total_cookies: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_method: "stripe" | "etransfer";
  status: string;
}

interface CapStatus {
  weekStart: string;
  cap: number;
  committed: number;
  remaining: number;
}

export const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending_stripe: "Awaiting card payment",
  pending_etransfer: "Awaiting e-Transfer",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const STATUS_COLORS: Record<string, string> = {
  paid: "#166534",
  pending_stripe: "#a16207",
  pending_etransfer: "#a16207",
  cancelled: "#6b7280",
  expired: "#6b7280",
};

type ViewMode = "cards" | "table";

export default function AdminDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [capStatus, setCapStatus] = useState<CapStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("cards");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      setOrders(data.orders || []);
      setCapStatus(data.capStatus || null);
      setError(null);
    } catch {
      setError("Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(orderId: string, action: "confirm" | "cancel") {
    setActioningId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Action failed.");
        return;
      }
      await load();
    } finally {
      setActioningId(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: BRAND.colors.dark }}>
            Orders
          </h1>
          {capStatus && (
            <p className="mt-1 text-sm text-stone-500">
              Week of {capStatus.weekStart}: {capStatus.committed} / {capStatus.cap} cookies committed (
              {capStatus.remaining} left)
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm font-medium text-stone-400 hover:text-stone-600">
            View order form
          </a>
          <button onClick={logout} className="text-sm font-medium text-stone-400 hover:text-stone-600">
            Sign out
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-1 text-sm" style={{ borderColor: BRAND.colors.light }}>
          <button
            onClick={() => setView("cards")}
            className="rounded-md px-3 py-1.5 font-medium transition"
            style={
              view === "cards"
                ? { background: BRAND.colors.accent, color: "#fff" }
                : { color: BRAND.colors.dark }
            }
          >
            Cards
          </button>
          <button
            onClick={() => setView("table")}
            className="rounded-md px-3 py-1.5 font-medium transition"
            style={
              view === "table"
                ? { background: BRAND.colors.accent, color: "#fff" }
                : { color: BRAND.colors.dark }
            }
          >
            Table
          </button>
        </div>
        <a
          href="/api/admin/orders/export"
          className="rounded-lg border px-3 py-1.5 text-sm font-semibold hover:bg-white"
          style={{ borderColor: BRAND.colors.light, color: BRAND.colors.dark }}
        >
          Export CSV ↓
        </a>
      </div>

      {loading && <p className="text-sm text-stone-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && view === "cards" && (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} actioningId={actioningId} onAct={act} />
          ))}
          {orders.length === 0 && <p className="text-sm text-stone-500">No orders yet.</p>}
        </div>
      )}

      {!loading && view === "table" && (
        <OrderTable orders={orders} actioningId={actioningId} onAct={act} />
      )}
    </div>
  );
}

function OrderCard({
  order,
  actioningId,
  onAct,
}: {
  order: AdminOrder;
  actioningId: string | null;
  onAct: (orderId: string, action: "confirm" | "cancel") => void;
}) {
  return (
    <div className="rounded-xl2 border bg-white p-4 shadow-card" style={{ borderColor: BRAND.colors.light }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-stone-800">{order.customer_name}</p>
          <p className="text-xs text-stone-400">
            {order.customer_email}
            {order.customer_phone ? ` • ${order.customer_phone}` : ""}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold text-white"
          style={{ background: STATUS_COLORS[order.status] || "#6b7280" }}
        >
          {STATUS_LABELS[order.status] || order.status}
        </span>
      </div>

      <p className="mt-2 text-sm text-stone-600">{orderItemsSummary(order.items)}</p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-stone-500">
          {order.total_cookies} cookies • {formatCents(order.total_cents)}{" "}
          <span className="text-xs text-stone-400">
            ({formatCents(order.subtotal_cents)} + {TAX_LABEL} {formatCents(order.tax_cents)})
          </span>{" "}
          • {order.payment_method === "stripe" ? "Card" : "e-Transfer"} • {new Date(order.created_at).toLocaleString()}
        </span>

        {order.status === "pending_etransfer" && (
          <OrderActions orderId={order.id} actioningId={actioningId} onAct={onAct} />
        )}
      </div>
    </div>
  );
}

function OrderActions({
  orderId,
  actioningId,
  onAct,
}: {
  orderId: string;
  actioningId: string | null;
  onAct: (orderId: string, action: "confirm" | "cancel") => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onAct(orderId, "confirm")}
        disabled={actioningId === orderId}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        style={{ background: BRAND.colors.accent }}
      >
        Mark paid
      </button>
      <button
        onClick={() => onAct(orderId, "cancel")}
        disabled={actioningId === orderId}
        className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-stone-600 disabled:opacity-50"
        style={{ borderColor: BRAND.colors.light }}
      >
        Cancel
      </button>
    </div>
  );
}

function OrderTable({
  orders,
  actioningId,
  onAct,
}: {
  orders: AdminOrder[];
  actioningId: string | null;
  onAct: (orderId: string, action: "confirm" | "cancel") => void;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-stone-500">No orders yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl2 border shadow-card" style={{ borderColor: BRAND.colors.light }}>
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr style={{ background: BRAND.colors.light + "55" }}>
            <Th>Customer</Th>
            <Th>Contact</Th>
            <Th>Items</Th>
            <Th align="right">Cookies</Th>
            <Th align="right">Subtotal</Th>
            <Th align="right">{TAX_LABEL}</Th>
            <Th align="right">Total</Th>
            <Th>Payment</Th>
            <Th>Status</Th>
            <Th>Placed</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => (
            <tr
              key={order.id}
              className="border-t"
              style={{
                borderColor: BRAND.colors.light,
                background: idx % 2 === 1 ? "#fffaf3" : "#ffffff",
              }}
            >
              <Td className="font-medium text-stone-800">{order.customer_name}</Td>
              <Td className="text-xs text-stone-500">
                {order.customer_email}
                {order.customer_phone ? (
                  <>
                    <br />
                    {order.customer_phone}
                  </>
                ) : null}
              </Td>
              <Td className="max-w-[240px] text-xs text-stone-600">{orderItemsSummary(order.items)}</Td>
              <Td align="right">{order.total_cookies}</Td>
              <Td align="right">{formatCents(order.subtotal_cents)}</Td>
              <Td align="right">{formatCents(order.tax_cents)}</Td>
              <Td align="right" className="font-semibold text-stone-800">
                {formatCents(order.total_cents)}
              </Td>
              <Td>{order.payment_method === "stripe" ? "Card" : "e-Transfer"}</Td>
              <Td>
                <span
                  className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                  style={{ background: STATUS_COLORS[order.status] || "#6b7280" }}
                >
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </Td>
              <Td className="whitespace-nowrap text-xs text-stone-500">
                {new Date(order.created_at).toLocaleString()}
              </Td>
              <Td>
                {order.status === "pending_etransfer" ? (
                  <OrderActions orderId={order.id} actioningId={actioningId} onAct={onAct} />
                ) : (
                  <span className="text-xs text-stone-300">—</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 align-top ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}