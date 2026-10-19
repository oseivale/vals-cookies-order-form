import { z } from "zod";
import {
  FLAVOUR_IDS,
  PACK_IDS,
  BANANA_BREAD_IDS,
  TAX_RATE,
  getPack,
  getFlavour,
  getBananaBreadOption,
  type PackId,
  type FlavourId,
  type BananaBreadId,
} from "./config";// A single pack selection within a customer's submission. `flavours` maps
// flavour id -> quantity within that pack; the quantities must sum to the
// pack's cookie count (enforced both client-side for UX and server-side for
// integrity).
export interface OrderItem {
  packId: PackId;
  flavours: Partial<Record<FlavourId, number>>;
}

// A banana bread selection — no flavours, just a size (3 or 6 pieces) and
// how many boxes of that size.
export interface BananaBreadOrderItem {
  id: BananaBreadId;
  quantity: number;
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

export const bananaBreadItemSchema = z.object({
  id: z.enum(BANANA_BREAD_IDS as [BananaBreadId, ...BananaBreadId[]]),
  quantity: z.number().int().min(1).max(50),
});

export const customerDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const createOrderSchema = z
  .object({
    customer: customerDetailsSchema,
    items: z.array(orderItemSchema).default([]),
    bananaBread: z.array(bananaBreadItemSchema).default([]),
    paymentMethod: z.enum(["stripe", "etransfer"]),
    pickupLocation: z.enum(["pickering", "vaughan"]),
  })
  .superRefine((order, ctx) => {
    if (order.items.length === 0 && order.bananaBread.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one item to your order.",
        path: ["items"],
      });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export function orderItemCookieCount(item: OrderItem): number {
  return Object.values(item.flavours).reduce((sum, n) => sum + (n ?? 0), 0);
}

export function orderTotalCookies(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + orderItemCookieCount(item), 0);
}

/** Pre-tax total for a set of banana bread line items, in cents. */
export function bananaBreadTotalCents(bananaBread: BananaBreadOrderItem[]): number {
  return bananaBread.reduce((sum, item) => {
    const option = getBananaBreadOption(item.id);
    return sum + (option ? option.priceCents * item.quantity : 0);
  }, 0);
}

/** Pre-tax total across all packs and banana bread items, in cents. */
export function orderTotalCents(items: OrderItem[], bananaBread: BananaBreadOrderItem[] = []): number {
  const packTotal = items.reduce((sum, item) => {
    const pack = getPack(item.packId);
    return sum + (pack ? pack.priceCents : 0);
  }, 0);
  return packTotal + bananaBreadTotalCents(bananaBread);
}

/** Tax owed on the order, in cents, rounded to the nearest cent. */
export function orderTaxCents(items: OrderItem[], bananaBread: BananaBreadOrderItem[] = []): number {
  return Math.round(orderTotalCents(items, bananaBread) * TAX_RATE);
}

/** Subtotal + tax, in cents — the amount actually charged/requested. */
export function orderGrandTotalCents(items: OrderItem[], bananaBread: BananaBreadOrderItem[] = []): number {
  return orderTotalCents(items, bananaBread) + orderTaxCents(items, bananaBread);
}

/** Short human-friendly reference code customers quote in their e-Transfer message. */
export function orderReferenceCode(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

export function orderItemsSummary(items: OrderItem[], bananaBread: BananaBreadOrderItem[] = []): string {
  const packLines = items.map((item) => {
    const pack = getPack(item.packId);
    const flavours = Object.entries(item.flavours)
      .filter(([, qty]) => (qty ?? 0) > 0)
      .map(([id, qty]) => `${qty}× ${getFlavour(id)?.name ?? id}`)
      .join(", ");
    return `${pack?.name ?? item.packId} (${flavours})`;
  });
  const bananaBreadLines = bananaBread
    .filter((item) => item.quantity > 0)
    .map((item) => {
      const option = getBananaBreadOption(item.id);
      return `${item.quantity}× ${option?.name ?? item.id}`;
    });
  return [...packLines, ...bananaBreadLines].join("; ");
}