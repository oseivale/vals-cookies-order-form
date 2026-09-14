import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { markOrderConfirmedByAdmin } from "@/lib/db";
import { sendOrderConfirmationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Manual confirmation for Interac e-Transfer orders: an admin checks their
// bank/email for the incoming e-Transfer matching the order's reference code
// and amount, then hits this endpoint to mark it paid — which is what
// triggers the same branded confirmation email Stripe orders get.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const order = await markOrderConfirmedByAdmin(id, "admin");
  if (!order) {
    return NextResponse.json(
      { error: "Order not found, or it isn't a pending e-Transfer order." },
      { status: 404 }
    );
  }

  try {
    await sendOrderConfirmationEmail(order);
  } catch (err) {
    console.error("Failed to send confirmation email for order", order.id, err);
    return NextResponse.json({
      order,
      warning: "Order marked paid, but the confirmation email failed to send. Check email configuration.",
    });
  }

  return NextResponse.json({ order });
}
