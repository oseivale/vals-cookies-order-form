import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { markOrderCancelledByAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

// Cancels a pending order (e.g. an e-Transfer that never arrived) so its
// cookies are released back into the weekly cap for other customers.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const order = await markOrderCancelledByAdmin(id, "admin");
  if (!order) {
    return NextResponse.json({ error: "Order not found, or it isn't cancellable." }, { status: 404 });
  }

  return NextResponse.json({ order });
}
