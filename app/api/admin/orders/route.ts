import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { listRecentOrders } from "@/lib/db";
import { getCapStatus } from "@/lib/cap";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [orders, capStatus] = await Promise.all([listRecentOrders(200), getCapStatus()]);
  return NextResponse.json({ orders, capStatus });
}
