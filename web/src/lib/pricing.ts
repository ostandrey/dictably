/**
 * Prices & plan limits — single source for landing copy.
 * Not final (O-D10). Change here; do not hardcode in components.
 * Founding block can be toggled without layout edits.
 */

export const pricing = {
  currency: "USD",
  pro: {
    id: "pro",
    priceMonthly: 19,
    hours: 20,
  },
  pack: {
    id: "payg",
    price: 9,
    hours: 5,
    validityMonths: 12,
  },
  founding: {
    enabled: true,
    id: "founding",
    priceMonthly: 9,
    priceYearly: 90,
    seats: 30,
    lockedForever: true,
  },
} as const;

export type PricingConfig = typeof pricing;
