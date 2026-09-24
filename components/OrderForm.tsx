"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BRAND,
  FLAVOURS,
  PACKS,
  PICKUP_DAY,
  PICKUP_LOCATIONS,
  TAX_LABEL,
  formatCents,
  getPack,
  type FlavourId,
  type PackId,
  type PaymentMethod,
  type PickupLocationId,
} from "@/lib/config";
import { orderTaxCents, orderGrandTotalCents } from "@/lib/order";

interface PackOrder {
  uid: string;
  packId: PackId;
  flavours: Record<FlavourId, number>;
}

interface CapStatus {
  weekStart: string;
  cap: number;
  committed: number;
  remaining: number;
}

function emptyFlavours(): Record<FlavourId, number> {
  return { "classic-oatmeal": 0, "chocolate-chunk": 0, "chewy-almond": 0 };
}

function makePackOrder(packId: PackId = "six-picks"): PackOrder {
  const pack = getPack(packId)!;
  const flavours = emptyFlavours();
  // Friendly default: put the whole pack in the first flavour so the
  // customer starts from a valid, submittable state and only needs to
  // adjust if they want a mix.
  flavours["classic-oatmeal"] = pack.count;
  return { uid: crypto.randomUUID(), packId, flavours };
}

function packCookieCount(order: PackOrder): number {
  return Object.values(order.flavours).reduce((sum, n) => sum + n, 0);
}

export default function OrderForm() {
  const router = useRouter();
  const [capStatus, setCapStatus] = useState<CapStatus | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [packOrders, setPackOrders] = useState<PackOrder[]>([makePackOrder()]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [pickupLocation, setPickupLocation] = useState<PickupLocationId>(PICKUP_LOCATIONS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cap-status")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          if (data?.error) setCapError(data.error);
          else setCapStatus(data);
        }
      })
      .catch(() => !cancelled && setCapError("Could not load this week's availability."));
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCookies = useMemo(() => packOrders.reduce((sum, o) => sum + packCookieCount(o), 0), [packOrders]);
  const orderItems = useMemo(() => packOrders.map((o) => ({ packId: o.packId, flavours: o.flavours })), [packOrders]);
  const subtotalCents = useMemo(
    () => packOrders.reduce((sum, o) => sum + (getPack(o.packId)?.priceCents ?? 0), 0),
    [packOrders]
  );
  const taxCents = useMemo(() => orderTaxCents(orderItems), [orderItems]);
  const totalCents = useMemo(() => orderGrandTotalCents(orderItems), [orderItems]);

  const soldOut = capStatus !== null && capStatus.remaining <= 0;
  const overCap = capStatus !== null && totalCookies > capStatus.remaining;

  function updatePackOrder(uid: string, updater: (order: PackOrder) => PackOrder) {
    setPackOrders((prev) => prev.map((o) => (o.uid === uid ? updater(o) : o)));
  }

  function changePackSize(uid: string, packId: PackId) {
    setPackOrders((prev) => prev.map((o) => (o.uid === uid ? { ...makePackOrder(packId), uid } : o)));
  }

  function setFlavourCount(uid: string, flavourId: FlavourId, rawValue: number) {
    updatePackOrder(uid, (order) => {
      const pack = getPack(order.packId)!;
      const others = Object.entries(order.flavours)
        .filter(([id]) => id !== flavourId)
        .reduce((sum, [, n]) => sum + n, 0);
      const clamped = Math.max(0, Math.min(rawValue, pack.count - others));
      return { ...order, flavours: { ...order.flavours, [flavourId]: clamped } };
    });
  }

  function addPackOrder() {
    setPackOrders((prev) => [...prev, makePackOrder()]);
  }

  function removePackOrder(uid: string) {
    setPackOrders((prev) => (prev.length > 1 ? prev.filter((o) => o.uid !== uid) : prev));
  }

  function setAllOneFlavour(uid: string, flavourId: FlavourId) {
    updatePackOrder(uid, (order) => {
      const pack = getPack(order.packId)!;
      const flavours = emptyFlavours();
      flavours[flavourId] = pack.count;
      return { ...order, flavours };
    });
  }

  const packsAreValid = packOrders.every((o) => packCookieCount(o) === getPack(o.packId)!.count);
  const canSubmit =
    packsAreValid && name.trim() && /\S+@\S+\.\S+/.test(email) && !submitting && !soldOut && !overCap;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name, email, phone, notes },
          items: packOrders.map((o) => ({ packId: o.packId, flavours: o.flavours })),
          paymentMethod,
          pickupLocation,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Something went wrong. Please try again.");
        if (typeof data.remaining === "number") {
          setCapStatus((prev) => (prev ? { ...prev, remaining: data.remaining } : prev));
        }
        return;
      }

      if (paymentMethod === "stripe" && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      router.push(`/order/${data.orderId}/confirmation`);
    } catch {
      setFormError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in">
      {/* Weekly capacity banner */}
      <div
        className="rounded-xl2 border px-5 py-4 text-sm"
        style={{ borderColor: BRAND.colors.light, background: "#fffaf3" }}
      >
        {capError && <p className="text-stone-500">{capError}</p>}
        {!capError && capStatus === null && <p className="text-stone-500">Checking this week's availability…</p>}
        {capStatus && !soldOut && (
          <p className="text-stone-700">
            <strong style={{ color: BRAND.colors.dark }}>{capStatus.remaining}</strong> of{" "}
            {capStatus.cap} cookies left this week — baked fresh, first come first served.
          </p>
        )}
        {capStatus && soldOut && (
          <p className="font-medium" style={{ color: BRAND.colors.dark }}>
            We've hit this week's cookie cap! Thank you for the love — new orders open again Monday.
          </p>
        )}
      </div>

      {/* Pack orders */}
      <div className="space-y-6">
        {packOrders.map((order, idx) => {
          const pack = getPack(order.packId)!;
          const count = packCookieCount(order);
          return (
            <div
              key={order.uid}
              className="rounded-xl2 border bg-white p-5 shadow-card"
              style={{ borderColor: BRAND.colors.light }}
            >
              <div className="mb-4 flex flex-col md:flex-row items-start md:justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Box {idx + 1}</p>
                  <select
                    value={order.packId}
                    onChange={(e) => changePackSize(order.uid, e.target.value as PackId)}
                    className="mt-1 bg-white rounded-lg w-[100%] md:w-full border md:px-3 py-2 font-display text-sm md:text-lg font-semibold"
                    style={{ borderColor: BRAND.colors.light, color: BRAND.colors.dark }}
                  >
                    {PACKS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.count} cookies — {formatCents(p.priceCents)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-stone-500">{pack.tagline}</p>
                </div>
                {packOrders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePackOrder(order.uid)}
                    className="text-xs font-medium text-red-400 hover:text-stone-600"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="mb-2 flex flex-wrap gap-2">
                {FLAVOURS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAllOneFlavour(order.uid, f.id)}
                    className="rounded-full border px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
                    style={{ borderColor: BRAND.colors.light }}
                  >
                    All {f.name}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {FLAVOURS.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-stone-700">{f.name}</p>
                      <p className="text-xs text-stone-400">{f.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease ${f.name}`}
                        onClick={() => setFlavourCount(order.uid, f.id, order.flavours[f.id] - 1)}
                        className="h-7 w-7 rounded-full border text-stone-600 hover:bg-white"
                        style={{ borderColor: BRAND.colors.light }}
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-semibold text-stone-700">
                        {order.flavours[f.id]}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${f.name}`}
                        onClick={() => setFlavourCount(order.uid, f.id, order.flavours[f.id] + 1)}
                        className="h-7 w-7 rounded-full border text-stone-600 hover:bg-white"
                        style={{ borderColor: BRAND.colors.light }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <p
                className={`mt-3 text-right text-xs font-medium ${count === pack.count ? "text-emerald-600" : "text-amber-600"}`}
              >
                {count} of {pack.count} cookies selected
              </p>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addPackOrder}
        className="w-full rounded-xl2 border-2 border-dashed py-3 text-sm font-medium hover:bg-white"
        style={{ borderColor: BRAND.colors.light, color: BRAND.colors.dark }}
      >
        + Add another box
      </button>

      {/* Running totals */}
      <div className="rounded-xl2 px-5 py-4 text-sm" style={{ background: BRAND.colors.light + "55" }}>
        <div className="flex justify-between">
          <span className="text-stone-600">Total cookies</span>
          <span className="font-semibold text-stone-800">{totalCookies}</span>
        </div>
        <div className="mt-2 flex justify-between border-t pt-2" style={{ borderColor: BRAND.colors.light }}>
          <span className="text-stone-600">Subtotal</span>
          <span className="text-stone-700">{formatCents(subtotalCents)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-stone-600">{TAX_LABEL}</span>
          <span className="text-stone-700">{formatCents(taxCents)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="font-medium text-stone-700">Total</span>
          <span className="font-display text-lg font-semibold" style={{ color: BRAND.colors.dark }}>
            {formatCents(totalCents)}
          </span>
        </div>
        {overCap && (
          <p className="mt-2 text-xs font-medium text-red-600">
            That's more than the {capStatus?.remaining} cookies left this week — please reduce your order.
          </p>
        )}
      </div>

      {/* Customer details */}
      <div className="rounded-xl2 border bg-white p-5 shadow-card" style={{ borderColor: BRAND.colors.light }}>
        <h2 className="font-display text-lg font-semibold" style={{ color: BRAND.colors.dark }}>
          Your details
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-stone-600">Name *</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: BRAND.colors.light }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600">Email *</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: BRAND.colors.light }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600">Phone (optional)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: BRAND.colors.light }}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-stone-600">Order notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: BRAND.colors.light }}
            />
          </label>
        </div>
      </div>

      {/* Pickup */}
      <div className="rounded-xl2 border bg-white p-5 shadow-card" style={{ borderColor: BRAND.colors.light }}>
        <h2 className="font-display text-lg font-semibold" style={{ color: BRAND.colors.dark }}>
          Pickup
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          All pickups are on <strong style={{ color: BRAND.colors.dark }}>{PICKUP_DAY}</strong> — just choose your
          location below.
        </p>
        <div className="mt-3 space-y-2">
          {PICKUP_LOCATIONS.map((loc) => (
            <label
              key={loc.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3"
              style={{ borderColor: pickupLocation === loc.id ? BRAND.colors.accent : BRAND.colors.light }}
            >
              <input
                type="radio"
                name="pickupLocation"
                checked={pickupLocation === loc.id}
                onChange={() => setPickupLocation(loc.id)}
              />
              <span className="text-sm font-medium text-stone-700">{loc.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Payment method */}

      {/* Payment method */}
      <div className="rounded-xl2 border bg-white p-5 shadow-card" style={{ borderColor: BRAND.colors.light }}>
        <h2 className="font-display text-lg font-semibold" style={{ color: BRAND.colors.dark }}>
          Payment
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label
            className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3"
            style={{ borderColor: paymentMethod === "stripe" ? BRAND.colors.accent : BRAND.colors.light }}
          >
            <input
              type="radio"
              name="paymentMethod"
              checked={paymentMethod === "stripe"}
              onChange={() => setPaymentMethod("stripe")}
            />
            <span className="text-sm">
              <span className="block font-medium text-stone-700">Pay by card</span>
              <span className="block text-xs text-stone-400">Secure checkout via Stripe</span>
            </span>
          </label>
          <label
            className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3"
            style={{ borderColor: paymentMethod === "etransfer" ? BRAND.colors.accent : BRAND.colors.light }}
          >
            <input
              type="radio"
              name="paymentMethod"
              checked={paymentMethod === "etransfer"}
              onChange={() => setPaymentMethod("etransfer")}
            />
            <span className="text-sm">
              <span className="block font-medium text-stone-700">Interac e-Transfer</span>
              <span className="block text-xs text-stone-400">Instructions shown after you submit</span>
            </span>
          </label>
        </div>
      </div>

      {formError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{formError}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-xl2 py-3 text-base font-semibold text-white shadow-card transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: BRAND.colors.accent }}
      >
        {submitting
          ? "Placing your order…"
          : paymentMethod === "stripe"
            ? `Continue to payment — ${formatCents(totalCents)}`
            : `Place order — ${formatCents(totalCents)}`}
      </button>
    </form>
  );
}
