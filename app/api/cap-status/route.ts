import { NextResponse } from "next/server";
import { getCapStatus } from "@/lib/cap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getCapStatus();
    return NextResponse.json(status);
  } catch (err) {
    console.error("cap-status error", err);
    return NextResponse.json({ error: "Could not load capacity right now." }, { status: 500 });
  }
}
