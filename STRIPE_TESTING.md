# Testing a full purchase flow with Stripe

This walks through testing **both** payment paths (Stripe card checkout and
Interac e-Transfer) end-to-end on your own machine, including every email
the app sends. Do all of this in **Stripe test mode** — no real money moves,
and test-mode data is completely separate from anything that happens once
you go live.

## 1. Switch to test mode and get test keys

1. Log into [dashboard.stripe.com](https://dashboard.stripe.com). There's a
   **Test mode** toggle in the top-right of the dashboard — turn it on. (If
   your account is brand new, you may already be in test mode by default.)
2. Go to **Developers → API keys**. While test mode is on, the "Secret key"
   shown starts with `sk_test_...` — copy it into your local `.env` as
   `STRIPE_SECRET_KEY`. Test and live keys are separate; make sure you don't
   accidentally copy a `sk_live_...` key while testing.

## 2. Install the Stripe CLI and forward webhooks locally

Your app's webhook handler (`app/api/webhooks/stripe/route.ts`) needs Stripe
to be able to reach it, but `localhost:3000` isn't reachable from the
internet. The Stripe CLI solves this by forwarding events to your machine.

**macOS (Homebrew):**
```bash
brew install stripe/stripe-cli/stripe
```

**Other platforms:** see
[stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli#install) for
the Linux/Windows download.

Then authenticate it against your account:
```bash
stripe login
```
This opens a browser tab to confirm the pairing — it links the CLI to
whichever Stripe account you're logged into (test mode data only, it can't
touch live payments unless you explicitly ask it to).

## 3. Start your app and the webhook forwarder

In one terminal, start the app as usual:
```bash
npm run dev
```

In a **second terminal**, start forwarding:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This prints a line like:
```
Ready! Your webhook signing secret is whsec_XXXXXXXXXXXXXXXXXXXX (^C to quit)
```

Copy that `whsec_...` value into your local `.env` as `STRIPE_WEBHOOK_SECRET`,
then restart `npm run dev` so it picks up the new value. **Leave the
`stripe listen` terminal running** for the rest of testing — it's what
actually delivers `checkout.session.completed` events to your app, which is
what triggers the paid-confirmation email.

> This local `whsec_...` is different from the one you'll eventually get
> from a real webhook endpoint added in the Stripe dashboard for your
> deployed site — that's a separate, second webhook secret for production.
> Don't mix the two up.

## 4. Test card numbers

Use these on Stripe's hosted Checkout page — any future expiry date, any
3-digit CVC, and any postal code work with all of them:

| Number | Result |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Always declined (generic decline) |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0025 0000 3155` | Requires authentication (3D Secure modal) |

Full list: [stripe.com/docs/testing](https://stripe.com/docs/testing#cards).

## 5. Walk through a Stripe (card) order

1. Open `http://localhost:3000` and fill out the order form. **Use an email
   address you can actually check** — Resend will really send to it, just
   with fake payment data behind it.
2. Choose **Stripe** as the payment method and submit. You'll be redirected
   to a Stripe-hosted Checkout page showing your order and the 13% HST line
   item.
3. Pay with `4242 4242 4242 4242`. On success, Stripe redirects you back to
   `/order/<id>/confirmation`.
4. That page shows "Finalizing your payment…" briefly while it polls
   `/api/orders/<id>` — within a few seconds it should flip to "You're all
   set!" once the webhook lands. Watch your `stripe listen` terminal: you
   should see a `checkout.session.completed` event logged there the moment
   Stripe sends it.
5. Check the inbox for the email you used — you should receive **"Your
   Sweet Batch Cookie Co. order is confirmed 🍪"** within a few seconds
   (sent by `sendOrderConfirmationEmail`, triggered from the webhook
   handler once the order flips to `paid`).
6. To test a **declined** card instead, repeat with `4000 0000 0000 0002` —
   Stripe's Checkout page will show the decline inline and let you retry
   with a different card, without creating a second order.

## 6. Walk through an Interac e-Transfer order

1. Submit a new order, choosing **Interac e-Transfer** this time (use an
   email you can check again).
2. You're redirected straight to `/order/<id>/confirmation` — no Stripe
   involved. It should show "Almost there!" with the send-to email, amount
   (subtotal + HST), and a reference code, and the order status is
   `pending_etransfer`.
3. Check the inbox for that order's email: you should now receive **two**
   things in total for this flow — first, immediately, **"Action needed:
   send your e-Transfer to confirm your Sweet Batch Cookie Co. order 🍪"**
   (the new pending-instructions email, sent the moment the order is
   created, in addition to — not instead of — the confirmation page
   showing the same details).
4. Log into `/admin` with your `ADMIN_PASSWORD`. The order should appear in
   the list with status "Pending e-Transfer" and the amount due.
5. Click **Mark paid** (simulating you having actually checked your bank
   and seen the e-Transfer arrive). This should immediately trigger the
   second email — **"Your Sweet Batch Cookie Co. order is confirmed 🍪"**
   — the same paid-confirmation template Stripe orders get, since both
   paths call `sendOrderConfirmationEmail` once an order is marked `paid`.
6. Refresh the customer's confirmation page (or just note the admin
   dashboard now shows it as paid) — the order should now read "You're all
   set!" too.
7. Optionally, place a third e-Transfer order and click **Cancel** instead
   of **Mark paid** in `/admin` — confirm its cookies are released back
   into the weekly cap (check `/api/cap-status` or the remaining-count
   shown on the order form).

## 7. What you've now verified

- Stripe Checkout session creation, the 13% HST line item, and the
  `checkout.session.completed` webhook flipping an order to `paid`.
- The Stripe paid-confirmation email.
- The e-Transfer pending-instructions email firing immediately at order
  creation, alongside the existing redirect to the info page (both happen
  for the same order — neither replaces the other).
- The e-Transfer paid-confirmation email, triggered by an admin action
  instead of a webhook, using the exact same email template/function as
  the Stripe path.
- The weekly cookie cap correctly releasing cookies from a cancelled order.

## 8. Before going live

- Flip the dashboard back to **live mode**, generate live-mode API keys
  (`sk_live_...`), and add a **second** webhook endpoint under
  **Developers → Webhooks** pointing at your deployed
  `https://your-site/api/webhooks/stripe` URL, selecting
  `checkout.session.completed` and `checkout.session.expired`. That
  endpoint has its own `whsec_...` — put that (not the CLI's) into your
  production `STRIPE_WEBHOOK_SECRET`.
- Double check `FROM_EMAIL` is on a domain you've verified in Resend —
  emails from an unverified domain either won't send or will land in spam.
- The `checkout.session.expired` event (an abandoned Stripe checkout) is
  hard to trigger manually since real Checkout sessions expire after 24
  hours — it's exercised by the same handler as everything else above, so
  code-review it once (`app/api/webhooks/stripe/route.ts`) rather than
  waiting a day to test it live.
