"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BRAND,
  FLAVOURS,
  PACKS,
  BANANA_BREAD_OPTIONS,
  PICKUP_DAY,
  PICKUP_LOCATIONS,
  TAX_LABEL,
  formatCents,
  getPack,
  getBananaBreadOption,
  type FlavourId,
  type PackId,
  type BananaBreadId,
  type PaymentMethod,
  type PickupLocationId,
} from "@/lib/config";
import { orderTaxCents, orderGrandTotalCents } from "@/lib/order";

type BoxKind = "cookie" | "banana-bread";

interface CookieBoxEntry {
  uid: string;
  kind: "cookie";
  packId: PackId;
  flavours: Record<FlavourId, number>;
}

interface BananaBreadBoxEntry {
  uid: string;
  kind: "banana-bread";
  sizeId: BananaBreadId;
}

type BoxEntry = CookieBoxEntry | BananaBreadBoxEntry;

interface CapStatus {
  weekStart: string;
  cap: number;
  committed: number;
  remaining: number;
}

function emptyFlavours(): Record<FlavourId, number> {
  return { "classic-oatmeal": 0, "chocolate-chunk": 0, "chewy-almond": 0 };
}

function makeCookieBox(packId: PackId = "six-picks"): CookieBoxEntry {
  const pack = getPack(packId)!;
  const flavours = emptyFlavours();
  // Friendly default: put the whole pack in the first flavour so the
  // customer starts from a valid, submittable state and only needs to
  // adjust if they want a mix.
  flavours["classic-oatmeal"] = pack.count;
  return { uid: crypto.randomUUID(), kind: "cookie", packId, flavours };
}

function makeBananaBreadBox(sizeId: BananaBreadId = BANANA_BREAD_OPTIONS[0].id): BananaBreadBoxEntry {
  return { uid: crypto.randomUUID(), kind: "banana-bread", sizeId };
}

function boxCookieCount(box: BoxEntry): number {
  if (box.kind !== "cookie") return 0;
  return Object.values(box.flavours).reduce((sum, n) => sum + n, 0);
}

export default function OrderForm() {
  const router = useRouter();
  const [capStatus, setCapStatus] = useState<CapStatus | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<BoxEntry[]>([makeCookieBox()]);
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

  const totalCookies = useMemo(() => boxes.reduce((sum, b) => sum + boxCookieCount(b), 0), [boxes]);

  const orderItems = useMemo(
    () =>
      boxes
        .filter((b): b is CookieBoxEntry => b.kind === "cookie")
        .map((b) => ({ packId: b.packId, flavours: b.flavours })),
    [boxes]
  );

  const bananaBreadItems = useMemo(
    () =>
      boxes
        .filter((b): b is BananaBreadBoxEntry => b.kind === "banana-bread")
        .map((b) => ({ id: b.sizeId, quantity: 1 })),
    [boxes]
  );

  const subtotalCents = useMemo(
    () =>
      boxes.reduce((sum, b) => {
        if (b.kind === "cookie") return sum + (getPack(b.packId)?.priceCents ?? 0);
        return sum + (getBananaBreadOption(b.sizeId)?.priceCents ?? 0);
      }, 0),
    [boxes]
  );

  const taxCents = useMemo(() => orderTaxCents(orderItems, bananaBreadItems), [orderItems, bananaBreadItems]);
  const totalCents = useMemo(() => orderGrandTotalCents(orderItems, bananaBreadItems), [orderItems, bananaBreadItems]);

  const soldOut = capStatus !== null && capStatus.remaining <= 0;
  const overCap = capStatus !== null && totalCookies > capStatus.remaining;

  function updateBox(uid: string, updater: (box: BoxEntry) => BoxEntry) {
    setBoxes((prev) => prev.map((b) => (b.uid === uid ? updater(b) : b)));
  }

  function changeBoxKind(uid: string, kind: BoxKind) {
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.uid !== uid) return b;
        return kind === "cookie" ? { ...makeCookieBox(), uid } : { ...makeBananaBreadBox(), uid };
      })
    );
  }

  function changePackSize(uid: string, packId: PackId) {
    setBoxes((prev) =>
      prev.map((b) => (b.uid === uid && b.kind === "cookie" ? { ...makeCookieBox(packId), uid } : b))
    );
  }

  function changeBananaBreadSize(uid: string, sizeId: BananaBreadId) {
    setBoxes((prev) => prev.map((b) => (b.uid === uid && b.kind === "banana-bread" ? { ...b, sizeId } : b)));
  }

  function setFlavourCount(uid: string, flavourId: FlavourId, rawValue: number) {
    updateBox(uid, (box) => {
      if (box.kind !== "cookie") return box;
      const pack = getPack(box.packId)!;
      const others = Object.entries(box.flavours)
        .filter(([id]) => id !== flavourId)
        .reduce((sum, [, n]) => sum + n, 0);
      const clamped = Math.max(0, Math.min(rawValue, pack.count - others));
      return { ...box, flavours: { ...box.flavours, [flavourId]: clamped } };
    });
  }

  function setAllOneFlavour(uid: string, flavourId: FlavourId) {
    updateBox(uid, (box) => {
      if (box.kind !== "cookie") return box;
      const pack = getPack(box.packId)!;
      const flavours = emptyFlavours();
      flavours[flavourId] = pack.count;
      return { ...box, flavours };
    });
  }

  function addBox(kind: BoxKind = "cookie") {
    setBoxes((prev) => [...prev, kind === "cookie" ? makeCookieBox() : makeBananaBreadBox()]);
  }

  function removeBox(uid: string) {
    setBoxes((prev) => (prev.length > 1 ? prev.filter((b) => b.uid !== uid) : prev));
  }

  const boxesAreValid = boxes.every((b) => (b.kind === "cookie" ? boxCookieCount(b) === getPack(b.packId)!.count : true));
  const canSubmit =
    boxesAreValid && name.trim() && /\S+@\S+\.\S+/.test(email) && !submitting && !soldOut && !overCap;

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
          items: orderItems,
          bananaBread: bananaBreadItems,
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

      {/* Boxes */}
      <div className="space-y-6">
        {boxes.map((box, idx) => {
          const isCookie = box.kind === "cookie";
          const pack = isCookie ? getPack(box.packId)! : null;
          const bananaBreadOption = !isCookie ? getBananaBreadOption(box.sizeId)! : null;
          const count = isCookie ? boxCookieCount(box) : 0;

          return (
            <div
              key={box.uid}
              className="rounded-xl2 border bg-white p-5 shadow-card"
              style={{ borderColor: BRAND.colors.light }}
            >
              <div className="mb-4 flex flex-col md:flex-row items-start md:justify-between gap-3">
                <div className="w-full">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Box {idx + 1}</p>

                  <div className="mt-1 inline-flex rounded-lg border p-1" style={{ borderColor: BRAND.colors.light }}>
                    <button
                      type="button"
                      onClick={() => changeBoxKind(box.uid, "cookie")}
                      className="rounded-md px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        background: isCookie ? BRAND.colors.accent : "transparent",
                        color: isCookie ? "#fff" : BRAND.colors.dark,
                      }}
                    >
                      Cookies
                    </button>
                    <button
                      type="button"
                      onClick={() => changeBoxKind(box.uid, "banana-bread")}
                      className="rounded-md px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        background: !isCookie ? BRAND.colors.accent : "transparent",
                        color: !isCookie ? "#fff" : BRAND.colors.dark,
                      }}
                    >
                      Banana Bread
                    </button>
                  </div>

                  {isCookie ? (
                    <>
                      <select
                        value={box.packId}
                        onChange={(e) => changePackSize(box.uid, e.target.value as PackId)}
                        className="mt-3 bg-white rounded-lg w-[100%] md:w-full border px-2 md:px-3 py-2 font-display text-sm md:text-lg font-semibold"
                        style={{ borderColor: BRAND.colors.light, color: BRAND.colors.dark }}
                      >
                        {PACKS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.count} cookies — {formatCents(p.priceCents)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-stone-500">{pack!.tagline}</p>
                    </>
                  ) : (
                    <>
                      <select
                        value={box.sizeId}
                        onChange={(e) => changeBananaBreadSize(box.uid, e.target.value as BananaBreadId)}
                        className="mt-3 bg-white rounded-lg w-[100%] md:w-full border px-2 md:px-3 py-2 font-display text-sm md:text-lg font-semibold"
                        style={{ borderColor: BRAND.colors.light, color: BRAND.colors.dark }}
                      >
                        {BANANA_BREAD_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name} — {formatCents(opt.priceCents)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-stone-500">
                        {bananaBreadOption!.pieces} pieces — {formatCents(bananaBreadOption!.priceCents)}
                      </p>
                    </>
                  )}
                </div>
                {boxes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBox(box.uid)}
                    className="text-xs font-medium text-red-400 hover:text-stone-600"
                  >
                    Remove
                  </button>
                )}
              </div>

              {isCookie && (
                <>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {FLAVOURS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setAllOneFlavour(box.uid, f.id)}
                        className="rounded-full border px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
                        style={{ borderColor: BRAND.colors.light }}
                      >
                        All {f.name}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {FLAVOURS.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-stone-700">{f.name}</p>
                          <p className="text-xs text-stone-400">{f.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Decrease ${f.name}`}
                            onClick={() => setFlavourCount(box.uid, f.id, box.flavours[f.id] - 1)}
                            className="h-7 w-7 rounded-full border text-stone-600 hover:bg-white"
                            style={{ borderColor: BRAND.colors.light }}
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-semibold text-stone-700">
                            {box.flavours[f.id]}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase ${f.name}`}
                            onClick={() => setFlavourCount(box.uid, f.id, box.flavours[f.id] + 1)}
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
                    className={`mt-3 text-right text-xs font-medium ${count === pack!.count ? "text-emerald-600" : "text-amber-600"}`}
                  >
                    {count} of {pack!.count} cookies selected
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => addBox("cookie")}
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
        {bananaBreadItems.length > 0 && (
          <div className="flex justify-between">
            <span className="text-stone-600">Banana bread boxes</span>
            <span className="font-semibold text-stone-800">{bananaBreadItems.length}</span>
          </div>
        )}
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