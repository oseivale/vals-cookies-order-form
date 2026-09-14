import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { markOrderPaidByStripeSession, getOrderByStripeSessionId, query } from "@/lib/db";
import { sendOrderConfirmationEmail } from "@/lib/email";

// Netlify's Next.js runtime does not parse the body for route handlers, so
// req.text() below gives us the exact raw bytes Stripe signed — required for
// signature verification. Do not add any body-parsing config here.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid") {
          const paymentIntentId =
            typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

          const updated = await markOrderPaidByStripeSession(session.id, paymentIntentId);
          // `updated` is only set if this was the transition that moved the
          // order into "paid" — guards against Stripe's at-least-once
          // webhook delivery sending the confirmation email twice.
          if (updated) {
            await sendOrderConfirmationEmail(updated).catch((err) =>
              console.error("Failed to send confirmation email for order", updated.id, err)
            );
          }
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const order = await getOrderByStripeSessionId(session.id);
        if (order && order.status === "pending_stripe") {
          await query(`UPDATE orders SET status = 'expired', updated_at = now() WHERE id = $1`, [order.id]);
        }
        break;
      }

      default:
        // Ignore everything else — we only act on the events above.
        break;
    }
  } catch (err) {
    console.error("Error handling Stripe webhook event", event.type, err);
    return NextResponse.json({ error: "Webhook handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
