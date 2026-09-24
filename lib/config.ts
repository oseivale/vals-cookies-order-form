// Single source of truth for pack sizes, flavours, pricing, branding, and the
// weekly cookie cap. Both server (API routes) and client (form UI) import
// from here so the numbers can never drift apart.

export type PackId = "two-of-a-kind" | "six-picks" | "friends-dozen";
export type FlavourId = "classic-oatmeal" | "chocolate-chunk" | "chewy-almond";
export type PaymentMethod = "stripe" | "etransfer";
export type PickupLocationId = "pickering" | "vaughan";

export interface PackDefinition {
  id: PackId;
  name: string;
  count: number; // number of cookies in this pack
  priceCents: number;
  tagline: string;
}

export interface FlavourDefinition {
  id: FlavourId;
  name: string;
  description: string;
}

export const PACKS: PackDefinition[] = [
  {
    id: "two-of-a-kind",
    name: "Two of a Kind",
    count: 2,
    priceCents: 400,
    tagline: "A little something sweet, just for you.",
  },
  {
    id: "six-picks",
    name: "Six Picks",
    count: 6,
    priceCents: 1000,
    tagline: "Perfect for sharing (or not).",
    // tagline: "Our most popular box — perfect for sharing (or not).",
  },
  {
    id: "friends-dozen",
    name: "Friends Dozen",
    count: 12,
    priceCents: 1800,
    tagline: "A full dozen for the whole crew.",
  },
];

export const FLAVOURS: FlavourDefinition[] = [
  {
    id: "classic-oatmeal",
    name: "Classic Oatmeal",
    description: "A timeless, chewy oatmeal cookie.",
  },
  {
    id: "chocolate-chunk",
    name: "Chocolate Chip",
    description: "Loaded with generous chunks of chocolate.",
  },
  // {
  //   id: "chewy-almond",
  //   name: "Chewy Almond",
  //   description: "Soft, nutty, and just the right amount of chewy.",
  // },
];

export const FLAVOUR_IDS = FLAVOURS.map((f) => f.id) as FlavourId[];
export const PACK_IDS = PACKS.map((p) => p.id) as PackId[];

export function getPack(id: string): PackDefinition | undefined {
  return PACKS.find((p) => p.id === id);
}

// export function getFlavour(id: string): FlavourDefinition | undefined {
//   return FLAVOURS.find((f) => f.id === id);
// }
export function getFlavour(id: string): FlavourDefinition | undefined {
  return FLAVOURS.find((f) => f.id === id);
}

// ---- Pickup ----
export interface PickupLocationDefinition {
  id: PickupLocationId;
  name: string;
}

export const PICKUP_LOCATIONS: PickupLocationDefinition[] = [
  { id: "pickering", name: "Pickering" },
  { id: "vaughan", name: "Vaughan" },
];

// Only one pickup day right now, so it's not a customer choice — just a
// fixed value shown as info text on the form. If you ever go back to
// multiple days, reintroduce a PICKUP_DAYS array + PickupDayId type here.
export const PICKUP_DAY = "Fridays";

export function getPickupLocation(id: string): PickupLocationDefinition | undefined {
  return PICKUP_LOCATIONS.find((p) => p.id === id);
}

// ---- Weekly cap ----
// The cap applies to the *total number of cookies* ordered across all
// customers in a given week, not per-customer. Week boundaries reset every
// Monday at 00:00 in the America/Toronto timezone (the bakery's local time),
// regardless of what timezone a customer is ordering from.
export const WEEKLY_COOKIE_CAP = 200;
export const CAP_TIMEZONE = "America/Toronto";

// ---- Tax ----
// Flat-rate tax applied to every order's subtotal, regardless of payment
// method. Set for Ontario HST — change both values together if the bakery
// operates from (or needs to charge) a different province.
export const TAX_RATE = 0.13; // 13% Ontario HST
export const TAX_LABEL = "HST (13%)";

// ---- Branding ----
// export const BRAND = {
//   name: "Val's Cookies & Treats",
//   colors: {
//     accent: "#fa945d", // primary / buttons / highlights
//     light: "#eac394", // secondary / backgrounds / soft accents
//     dark: "#996236", // text accents / borders / footer
//   },
//   welcomeMessage:
//     "Hi there! We're so glad you stopped by. Every box is baked fresh, in small weekly batches — so once we hit our cap for the week, that's it until Monday. Build your box below.",
// } as const;
// ---- Branding ----
export const BRAND = {
  name: "Val's Cookies",
  colors: {
    accent: "#fa945d", // primary / buttons / highlights
    light: "#eac394", // secondary / backgrounds / soft accents
    dark: "#996236", // text accents / borders / footer
  },
  welcomeHeading: "Freshly baked, just for you",
  welcomeGreeting: "Hi there! We're so glad you stopped by.",
  welcomeMessage:
    "Every box of Val's Cookies is baked fresh in small weekly batches. We only take a limited number of orders each week, so once we hit our baking cap, orders will close until Monday!",
  howItWorks: [
    {
      icon: "/icons/cookie.svg",
      title: "Build your box",
      description: "Choose your favourites and tell us how many you'd like.",
    },
    {
      icon: "/icons/location.svg",
      title: "Pickup only",
      description:
        "We currently offer local pickup in Pickering and Vaughan. You'll be able to select your preferred pickup location when placing your order.",
    },
    {
      icon: "/icons/calendar.svg",
      title: "Friday pickups",
      description:
        "Pickup details and your confirmed time will be provided with your order confirmation.",
    },
    {
      icon: "/icons/heart.svg",
      title: "Baked fresh each week",
      description:
        "Your cookies are prepared in small batches specifically for that week's orders — fresh, homemade and ready for you to enjoy.",
    },
  ],
  welcomeClosing: "Ready for something sweet? Build your box below!",
} as const;

// ---- Money formatting ----
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });
}
