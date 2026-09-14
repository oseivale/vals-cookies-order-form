import { getOrderById } from "@/lib/db";
import { orderReferenceCode } from "@/lib/order";
import ConfirmationView from "@/components/ConfirmationView";
import { BRAND } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-stone-700">Order not found</h1>
        <p className="mt-3 text-stone-500">
          We couldn't find that order. If you just placed one, check the confirmation link from your browser again.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <div className="mb-8 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-md p-2"
          // style={{ background: `linear-gradient(135deg, ${BRAND.colors.accent}, ${BRAND.colors.light})` }}
        >
          <img src="/vals-cookies-logo-v1.png" alt={`${BRAND.name} logo`} className="h-full w-full" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{BRAND.name}</p>
      </div>
      <ConfirmationView
        orderId={order.id}
        initialStatus={order.status}
        paymentMethod={order.payment_method}
        customerName={order.customer_name}
        subtotalCents={order.subtotal_cents}
        taxCents={order.tax_cents}
        totalCents={order.total_cents}
        reference={orderReferenceCode(order.id)}
        etransferEmail={process.env.ETRANSFER_EMAIL || "orders@example.com"}
      />
    </main>
  );
}
