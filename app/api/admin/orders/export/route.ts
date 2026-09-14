import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { listAllOrders } from "@/lib/db";
import { orderItemsSummary, orderReferenceCode } from "@/lib/order";
import { TAX_LABEL, formatCents } from "@/lib/config";

export const dynamic = "force-dynamic";

function csvField(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(",");
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const orders = await listAllOrders();

  const header = [
    "Reference",
    "Placed (Toronto time)",
    "Customer name",
    "Email",
    "Phone",
    "Items",
    "Total cookies",
    "Subtotal",
    TAX_LABEL,
    "Total",
    "Payment method",
    "Status",
    "Notes",
  ];

  const rows = orders.map((order) =>
    csvRow([
      orderReferenceCode(order.id),
      new Date(order.created_at).toLocaleString("en-CA", {
        timeZone: "America/Toronto",
        dateStyle: "medium",
        timeStyle: "short",
      }),
      order.customer_name,
      order.customer_email,
      order.customer_phone || "",
      orderItemsSummary(order.items),
      order.total_cookies,
      formatCents(order.subtotal_cents),
      formatCents(order.tax_cents),
      formatCents(order.total_cents),
      order.payment_method === "stripe" ? "Card (Stripe)" : "Interac e-Transfer",
      order.status,
      order.customer_notes || "",
    ])
  );

  const csv = [csvRow(header), ...rows].join("\r\n");
  const body = "\uFEFF" + csv;
  const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}