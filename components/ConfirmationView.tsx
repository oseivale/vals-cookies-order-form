"use client";

import { useEffect, useState } from "react";
import { BRAND, TAX_LABEL, formatCents } from "@/lib/config";
import type { OrderStatus } from "@/lib/db";

interface Props {
  orderId: string;
  initialStatus: OrderStatus;
  paymentMethod: "stripe" | "etransfer";
  customerName: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  reference: string;
  etransferEmail: string;
}

export default function ConfirmationView({
  orderId,
  initialStatus,
  paymentMethod,
  customerName,
  subtotalCents,
  taxCents,
  totalCents,
  reference,
  etransferEmail,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const firstName = customerName.split(" ")[0] || customerName;

  // If the customer lands here right after Stripe checkout, the webhook that
  // marks the order "paid" may not have arrived yet — poll briefly so the
  // page updates itself instead of showing a stale "processing" state.
  useEffect(() => {
    if (status !== "pending_stripe") return;
    let cancelled = false;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        const data = await res.json();
        if (!cancelled && data?.status) {
          setStatus(data.status);
          if (data.status !== "pending_stripe" || attempts >= 20) {
            clearInterval(interval);
          }
        }
      } catch {
        // Keep trying silently — a transient network hiccup shouldn't alarm the customer.
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status, orderId]);

  if (status === "paid") {
    return (
      <div className="rounded-xl2 border bg-white p-6 text-center shadow-card animate-fade-in" style={{ borderColor: BRAND.colors.light }}>
        <h1 className="font-display text-2xl font-semibold" style={{ color: BRAND.colors.dark }}>
          You're all set, {firstName}! 🎉
        </h1>
        <p className="mt-3 text-sm text-stone-600">
          Your order is confirmed and in this week's baking queue. A confirmation email is on its way to you.
        </p>
        <div className="mx-auto mt-5 inline-block rounded-lg bg-stone-50 px-5 py-3 text-left text-sm">
          <p className="text-stone-500">Order reference</p>
          <p className="font-semibold text-stone-800">{reference}</p>
          <div className="mt-3 space-y-1 border-t pt-3" style={{ borderColor: BRAND.colors.light }}>
            <Row label="Subtotal" value={formatCents(subtotalCents)} />
            <Row label={TAX_LABEL} value={formatCents(taxCents)} />
            <Row label="Total paid" value={formatCents(totalCents)} bold />
          </div>
        </div>
      </div>
    );
  }

  if (status === "pending_stripe") {
    return (
      <div className="rounded-xl2 border bg-white p-6 text-center shadow-card" style={{ borderColor: BRAND.colors.light }}>
        <h1 className="font-display text-xl font-semibold text-stone-700">Finalizing your payment…</h1>
        <p className="mt-3 text-sm text-stone-500">
          This usually only takes a few seconds. This page will update automatically — no need to refresh.
        </p>
      </div>
    );
  }

  if (status === "pending_etransfer") {
    return (
      <div className="rounded-xl2 border bg-white p-6 shadow-card animate-fade-in" style={{ borderColor: BRAND.colors.light }}>
        <h1 className="font-display text-2xl font-semibold text-center" style={{ color: BRAND.colors.dark }}>
          Almost there, {firstName}!
        </h1>
        <p className="mt-3 text-center text-sm text-stone-600">
          Your order is reserved. Send your Interac e-Transfer to confirm it — your box is only guaranteed once we
          receive payment.
        </p>
        <div className="mt-5 space-y-2 rounded-lg bg-stone-50 px-5 py-4 text-sm">
          <Row label="Send to" value={etransferEmail} />
          <Row label="Subtotal" value={formatCents(subtotalCents)} />
          <Row label={TAX_LABEL} value={formatCents(taxCents)} />
          <Row label="Amount" value={formatCents(totalCents)} bold />
          <Row label="Message / reference" value={reference} />
        </div>
        <p className="mt-4 text-xs text-stone-400">
          Please include the reference code above in your e-Transfer message so we can match it to your order. We'll
          email your confirmation as soon as it's received.
        </p>
                <BackHomeLink label="Back to home" />   {/* ← this line */}

      </div>
    );
  }

  return (
    <div className="rounded-xl2 border bg-white p-6 text-center shadow-card" style={{ borderColor: BRAND.colors.light }}>
      <h1 className="font-display text-xl font-semibold text-stone-700">
        {status === "cancelled" ? "This order was cancelled" : "This order has expired"}
      </h1>
      <p className="mt-3 text-sm text-stone-500">
        {paymentMethod === "stripe"
          ? "The checkout session wasn't completed in time."
          : "We didn't receive payment in time and released these cookies back for other customers."}{" "}
        Feel free to place a new order any time.
      </p>
      <a
        href="/"
        className="mt-5 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
        style={{ background: BRAND.colors.accent }}
      >
        Start a new order
      </a>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-medium text-stone-700" : "text-stone-500"}>{label}</span>
      <span className={bold ? "font-bold text-stone-900" : "font-semibold text-stone-800"}>{value}</span>
    </div>
  );
}

function BackHomeLink({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div className="mt-5 text-center">
      <a
        href="/"
        className={`text-sm font-medium underline decoration-stone-300 underline-offset-4 ${
          muted ? "text-stone-400 hover:text-stone-600" : "text-stone-500 hover:text-stone-700"
        }`}
      >
        {label}
      </a>
    </div>
  );
}