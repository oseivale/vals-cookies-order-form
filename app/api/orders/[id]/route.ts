import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // The order id itself is an unguessable UUID, so returning this subset to
  // whoever holds the link (the customer, from their own confirmation page)
  // is fine — we still omit phone/notes just to keep the surface small.
  return NextResponse.json({
    id: order.id,
    status: order.status,
    paymentMethod: order.payment_method,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    items: order.items,
    totalCookies: order.total_cookies,
    subtotalCents: order.subtotal_cents,
    taxCents: order.tax_cents,
    totalCents: order.total_cents,
    weekStart: order.week_start,
    createdAt: order.created_at,
  });
}
