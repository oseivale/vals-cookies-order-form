import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  createOrderSchema,
  orderReferenceCode,
  orderTotalCents,
  orderTaxCents,
  orderGrandTotalCents,
  orderTotalCookies,
} from "@/lib/order";
import { getPack, getFlavour, TAX_LABEL } from "@/lib/config";
import { getTorontoWeekStart, hasRoomForLocked } from "@/lib/cap";
import { insertOrder, setOrderStripeSession, withWeeklyCapLock, query, getPool, type OrderRow } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { sendEtransferPendingEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function siteUrl(req: NextRequest): string {
  return process.env.SITE_URL || req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { customer, items, paymentMethod, pickupLocation } = parsed.data;

  // Belt-and-suspenders: re-validate every pack/flavour id server-side even
  // though zod already checked enum membership, so pricing is always derived
  // from lib/config.ts (the customer's browser is never trusted for price).
  for (const item of items) {
    const pack = getPack(item.packId);
    if (!pack) {
      return NextResponse.json({ error: `Unknown pack: ${item.packId}` }, { status: 400 });
    }
    for (const flavourId of Object.keys(item.flavours)) {
      if (!getFlavour(flavourId)) {
        return NextResponse.json({ error: `Unknown flavour: ${flavourId}` }, { status: 400 });
      }
    }
  }

  const totalCookies = orderTotalCookies(items);
  const subtotalCents = orderTotalCents(items);
  const taxCents = orderTaxCents(items);
  const totalCents = orderGrandTotalCents(items);
  const weekStart = getTorontoWeekStart();
  const orderId = randomUUID();
  const initialStatus = paymentMethod === "stripe" ? "pending_stripe" : "pending_etransfer";

  let insertedOrder: OrderRow;
  try {
    insertedOrder = await withWeeklyCapLock(weekStart, async (client) => {
      const room = await hasRoomForLocked(client, weekStart, totalCookies);
      if (!room.ok) {
        throw new CapExceededError(room.remaining);
      }
      return insertOrder(client, {
        id: orderId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerNotes: customer.notes,
        items,
        totalCookies,
        subtotalCents,
        taxCents,
        totalCents,
        weekStart,
        pickupLocation,
        paymentMethod,
        status: initialStatus,
      });
    });
  } catch (err) {
    if (err instanceof CapExceededError) {
      return NextResponse.json(
        {
          error:
            err.remaining > 0
              ? `We only have ${err.remaining} cookie${err.remaining === 1 ? "" : "s"} left this week — please reduce your order.`
              : "We've reached this week's cookie cap. New orders open again Monday!",
          remaining: err.remaining,
        },
        { status: 409 }
      );
    }
    console.error("order insert failed", err);
    return NextResponse.json({ error: "Something went wrong placing your order. Please try again." }, { status: 500 });
  }

  if (paymentMethod === "etransfer") {
    const etransferEmail = process.env.ETRANSFER_EMAIL || "orders@example.com";

    // Additive: the customer is still redirected to the confirmation page
    // that shows these same instructions regardless of whether this email
    // succeeds, so a send failure here must never fail order creation.
    try {
      await sendEtransferPendingEmail(insertedOrder, etransferEmail);
    } catch (err) {
      console.error("Failed to send e-Transfer pending instructions email for order", insertedOrder.id, err);
    }

    return NextResponse.json({
      orderId: insertedOrder.id,
      status: insertedOrder.status,
      subtotalCents,
      taxCents,
      totalCents,
      etransfer: {
        sendTo: etransferEmail,
        amountCents: totalCents,
        reference: orderReferenceCode(insertedOrder.id),
        instructions:
          "Please send your e-Transfer for the exact amount shown (subtotal + HST), and include the reference code in the message so we can match it to your order.",
      },
    });
  }

  // Stripe flow: create the Checkout Session outside of the cap lock so the
  // network round-trip to Stripe never holds up other customers' orders.
  try {
    const stripe = getStripe();
    const origin = siteUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customer.email,
      line_items: [
        ...items.map((item) => {
          const pack = getPack(item.packId)!;
          return {
            quantity: 1,
            price_data: {
              currency: "cad",
              unit_amount: pack.priceCents,
              product_data: {
                name: `${pack.name} (${pack.count} cookies)`,
                description: Object.entries(item.flavours)
                  .filter(([, qty]) => (qty ?? 0) > 0)
                  .map(([flavourId, qty]) => `${qty} × ${getFlavour(flavourId)?.name ?? flavourId}`)
                  .join(", "),
              },
            },
          };
        }),
        // Tax as its own line item, computed the same way (and to the same
        // cent) as the subtotal/tax stored on the order and shown in the
        // e-Transfer instructions and confirmation email — so every surface
        // agrees on the total.
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: taxCents,
            product_data: { name: TAX_LABEL },
          },
        },
      ],
      success_url: `${origin}/order/${insertedOrder.id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=1`,
      metadata: { orderId: insertedOrder.id },
    });

    await setSessionOnOrder(insertedOrder.id, session.id);

    return NextResponse.json({
      orderId: insertedOrder.id,
      status: insertedOrder.status,
      checkoutUrl: session.url,
    });
  } catch (err) {
    console.error("stripe session creation failed", err);
    // Don't leave an orphaned pending_stripe order with no session reserving
    // cookies against the cap — cancel it so the customer can retry cleanly.
    await query(`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1`, [insertedOrder.id]);
    return NextResponse.json(
      { error: "We couldn't start your Stripe checkout. Please try again, or pay by e-Transfer instead." },
      { status: 502 }
    );
  }
}

class CapExceededError extends Error {
  remaining: number;
  constructor(remaining: number) {
    super("Weekly cookie cap exceeded");
    this.remaining = remaining;
  }
}

async function setSessionOnOrder(orderId: string, sessionId: string) {
  const client = await getPool().connect();
  try {
    await setOrderStripeSession(client, orderId, sessionId);
  } finally {
    client.release();
  }
}
