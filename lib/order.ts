import { z } from "zod";
import { FLAVOUR_IDS, PACK_IDS, TAX_RATE, getPack, getFlavour, type PackId, type FlavourId } from "./config";
// A single pack selection within a customer's submission. `flavours` maps
// flavour id -> quantity within that pack; the quantities must sum to the
// pack's cookie count (enforced both client-side for UX and server-side for
// integrity).
export interface OrderItem {
  packId: PackId;
  flavours: Partial<Record<FlavourId, number>>;
}

export interface CustomerDetails {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
}

export const orderItemSchema = z
  .object({
    packId: z.enum(PACK_IDS as [PackId, ...PackId[]]),
    flavours: z.record(z.enum(FLAVOUR_IDS as [FlavourId, ...FlavourId[]]), z.number().int().min(0)),
  })
  .superRefine((item, ctx) => {
    const pack = getPack(item.packId);
    if (!pack) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unknown pack." });
      return;
    }
    const total = Object.values(item.flavours).reduce((sum, n) => sum + (n ?? 0), 0);
    if (total !== pack.count) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${pack.name} needs exactly ${pack.count} cookies selected across flavours (got ${total}).`,
      });
    }
  });

export const customerDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const createOrderSchema = z.object({
  customer: customerDetailsSchema,
  items: z.array(orderItemSchema).min(1, "Add at least one pack to your order."),
  paymentMethod: z.enum(["stripe", "etransfer"]),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export function orderItemCookieCount(item: OrderItem): number {
  return Object.values(item.flavours).reduce((sum, n) => sum + (n ?? 0), 0);
}

export function orderTotalCookies(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + orderItemCookieCount(item), 0);
}

/** Pre-tax total across all packs in cents. */
export function orderTotalCents(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    const pack = getPack(item.packId);
    return sum + (pack ? pack.priceCents : 0);
  }, 0);
}

/** Tax owed on the order, in cents, rounded to the nearest cent. */
export function orderTaxCents(items: OrderItem[]): number {
  return Math.round(orderTotalCents(items) * TAX_RATE);
}

/** Subtotal + tax, in cents — the amount actually charged/requested. */
export function orderGrandTotalCents(items: OrderItem[]): number {
  return orderTotalCents(items) + orderTaxCents(items);
}

/** Short human-friendly reference code customers quote in their e-Transfer message. */
export function orderReferenceCode(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

export function orderItemsSummary(items: OrderItem[]): string {
  return items
    .map((item) => {
      const pack = getPack(item.packId);
      const flavours = Object.entries(item.flavours)
        .filter(([, qty]) => (qty ?? 0) > 0)
        .map(([id, qty]) => `${qty}× ${getFlavour(id)?.name ?? id}`)
        .join(", ");
      return `${pack?.name ?? item.packId} (${flavours})`;
    })
    .join("; ");
}