import nodemailer from "nodemailer";
import type { OrderRow } from "./db";
import { orderReferenceCode, type OrderItem } from "./order";
import { BRAND, TAX_LABEL, formatCents, getFlavour, getPack } from "./config";
import { markConfirmationEmailSent } from "./db";

// Nodemailer is configured to relay through Resend's SMTP endpoint. This
// satisfies "send with Nodemailer" while getting Resend's deliverability,
// domain auth (SPF/DKIM), and send analytics — swap the transport config
// below for any other SMTP provider (Gmail, SES, Mailgun, etc.) if you'd
// rather not use Resend; nothing else in the app needs to change.
let transporter: nodemailer.Transporter | undefined;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    if (!host || !user || !pass) {
      throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASSWORD environment variables must all be set.");
    }
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465 (implicit TLS), false for 587/25 (STARTTLS)
      auth: { user, pass },
    });
  }
  return transporter;
}

function itemsHtml(items: OrderItem[]): string {
  return items
    .map((item) => {
      const pack = getPack(item.packId);
      const flavourLines = Object.entries(item.flavours)
        .filter(([, qty]) => (qty ?? 0) > 0)
        .map(([flavourId, qty]) => `${qty} × ${getFlavour(flavourId)?.name ?? flavourId}`)
        .join("<br/>");
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${BRAND.colors.light};">
            <div style="font-weight:600;color:${BRAND.colors.dark};font-size:15px;">
              ${pack?.name ?? item.packId} <span style="font-weight:400;color:#6b6257;">(${pack?.count ?? "?"} cookies)</span>
            </div>
            <div style="color:#4a4238;font-size:14px;margin-top:4px;line-height:1.5;">${flavourLines}</div>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid ${BRAND.colors.light};text-align:right;font-weight:600;color:${BRAND.colors.dark};white-space:nowrap;">
            ${pack ? formatCents(pack.priceCents) : ""}
          </td>
        </tr>`;
    })
    .join("");
}

function confirmationEmailHtml(order: OrderRow): string {
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;background:#fdf6ee;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.colors.light};">
      <div style="background:${BRAND.colors.accent};padding:28px 32px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:0.5px;">${BRAND.name}</h1>
        <p style="margin:6px 0 0;color:#fff5ec;font-size:14px;">Order confirmed!</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="color:#3a332b;font-size:15px;line-height:1.6;">
          Hi ${order.customer_name.split(" ")[0] || order.customer_name},
        </p>
        <p style="color:#3a332b;font-size:15px;line-height:1.6;">
          Thank you! Your payment has been confirmed and your cookies are officially in this week's baking queue.
          Here's a summary of your order:
        </p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          ${itemsHtml(order.items)}
          <tr>
            <td style="padding:10px 0 0;color:#6b6257;font-size:14px;">Subtotal</td>
            <td style="padding:10px 0 0;text-align:right;color:#6b6257;font-size:14px;">${formatCents(order.subtotal_cents)}</td>
          </tr>
          <tr>
            <td style="padding:2px 0 0;color:#6b6257;font-size:14px;">${TAX_LABEL}</td>
            <td style="padding:2px 0 0;text-align:right;color:#6b6257;font-size:14px;">${formatCents(order.tax_cents)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 0;font-weight:700;color:${BRAND.colors.dark};">Total</td>
            <td style="padding:10px 0 0;text-align:right;font-weight:700;color:${BRAND.colors.dark};">${formatCents(order.total_cents)}</td>
          </tr>
        </table>
        <p style="color:#3a332b;font-size:14px;line-height:1.6;margin-top:20px;">
          Order reference: <strong>${orderReferenceCode(order.id)}</strong>
        </p>
        <p style="color:#6b6257;font-size:13px;line-height:1.6;margin-top:24px;">
          Questions about your order? Just reply to this email — we're happy to help.
        </p>
      </div>
      <div style="background:${BRAND.colors.light};padding:16px 32px;text-align:center;">
        <p style="margin:0;color:${BRAND.colors.dark};font-size:12px;">Baked fresh, in small weekly batches. Thanks for supporting us!</p>
      </div>
    </div>
  </div>`;
}

export async function sendOrderConfirmationEmail(order: OrderRow): Promise<void> {
  const fromAddress = process.env.FROM_EMAIL || `${BRAND.name} <orders@example.com>`;

  await getTransporter().sendMail({
    from: fromAddress,
    to: order.customer_email,
    subject: `Your ${BRAND.name} order is confirmed 🍪`,
    html: confirmationEmailHtml(order),
  });

  await markConfirmationEmailSent(order.id);
}

function etransferPendingEmailHtml(order: OrderRow, etransferEmail: string): string {
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;background:#fdf6ee;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.colors.light};">
      <div style="background:${BRAND.colors.accent};padding:28px 32px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:0.5px;">${BRAND.name}</h1>
        <p style="margin:6px 0 0;color:#fff5ec;font-size:14px;">Your order is reserved — pending e-Transfer</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="color:#3a332b;font-size:15px;line-height:1.6;">
          Hi ${order.customer_name.split(" ")[0] || order.customer_name},
        </p>
        <p style="color:#3a332b;font-size:15px;line-height:1.6;">
          Thanks for your order! We're holding these cookies for you, but your spot in this week's baking queue is
          only guaranteed once we receive your Interac e-Transfer. Here's what to send:
        </p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          ${itemsHtml(order.items)}
          <tr>
            <td style="padding:10px 0 0;color:#6b6257;font-size:14px;">Subtotal</td>
            <td style="padding:10px 0 0;text-align:right;color:#6b6257;font-size:14px;">${formatCents(order.subtotal_cents)}</td>
          </tr>
          <tr>
            <td style="padding:2px 0 0;color:#6b6257;font-size:14px;">${TAX_LABEL}</td>
            <td style="padding:2px 0 0;text-align:right;color:#6b6257;font-size:14px;">${formatCents(order.tax_cents)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 0;font-weight:700;color:${BRAND.colors.dark};">Amount to send</td>
            <td style="padding:10px 0 0;text-align:right;font-weight:700;color:${BRAND.colors.dark};">${formatCents(order.total_cents)}</td>
          </tr>
        </table>
        <div style="margin-top:20px;padding:16px 18px;background:${BRAND.colors.light};border-radius:10px;">
          <p style="margin:0 0 6px;color:${BRAND.colors.dark};font-size:13px;font-weight:600;">Send your e-Transfer to</p>
          <p style="margin:0;color:${BRAND.colors.dark};font-size:16px;font-weight:700;">${etransferEmail}</p>
        </div>
        <p style="color:#3a332b;font-size:14px;line-height:1.6;margin-top:20px;">
          Please include this reference code in your e-Transfer message so we can match it to your order:<br/>
          <strong>${orderReferenceCode(order.id)}</strong>
        </p>
        <p style="color:#6b6257;font-size:13px;line-height:1.6;margin-top:20px;">
          Your order is <strong>pending</strong> until we receive and confirm your e-Transfer — we'll send a separate
          confirmation email the moment that happens. If payment doesn't arrive in time, these cookies are released
          back into this week's batch for other customers.
        </p>
        <p style="color:#6b6257;font-size:13px;line-height:1.6;margin-top:16px;">
          Questions? Just reply to this email — we're happy to help.
        </p>
      </div>
      <div style="background:${BRAND.colors.light};padding:16px 32px;text-align:center;">
        <p style="margin:0;color:${BRAND.colors.dark};font-size:12px;">Baked fresh, in small weekly batches. Thanks for supporting us!</p>
      </div>
    </div>
  </div>`;
}

// Fired immediately when a customer chooses Interac e-Transfer at checkout —
// in addition to (not instead of) redirecting them to the confirmation page
// that already shows the same send-to details. This is a best-effort side
// effect: the caller should never let a failure here block order creation,
// since the customer still sees full instructions on the page regardless.
export async function sendEtransferPendingEmail(order: OrderRow, etransferEmail: string): Promise<void> {
  const fromAddress = process.env.FROM_EMAIL || `${BRAND.name} <orders@example.com>`;

  await getTransporter().sendMail({
    from: fromAddress,
    to: order.customer_email,
    subject: `Action needed: send your e-Transfer to confirm your ${BRAND.name} order 🍪`,
    html: etransferPendingEmailHtml(order, etransferEmail),
  });
}
