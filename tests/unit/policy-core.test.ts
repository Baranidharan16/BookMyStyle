import { describe, expect, it } from "vitest";
import { checkCoupon, computeQuote, refundForCancellation, refundForNoShow, type CouponRule } from "@/server/booking/policy-core";

const base: CouponRule = {
  type: "PERCENT", value: 20, maxDiscount: 30000, minAmount: 0, validFrom: new Date("2026-01-01"), validTo: new Date("2027-01-01"),
  startMinute: null, endMinute: null, weekdays: null, serviceIds: null, firstBookingOnly: false, newCustomerOnly: false,
  usageLimit: null, perUserLimit: 1, usedCount: 0, active: true,
};
const ctx = { now: new Date("2026-10-02"), subtotal: 100000, serviceId: "s1", appointmentWeekday: 6, appointmentMinute: 720, userUses: 0, customerPriorBookingsPlatform: 0, customerPriorBookingsSalon: 0 };

describe("coupons", () => {
  it("applies percentage with cap", () => {
    expect(checkCoupon(base, ctx)).toEqual({ ok: true, discount: 20000 });
    expect(checkCoupon({ ...base, value: 50 }, ctx)).toEqual({ ok: true, discount: 30000 });
  });
  it("flat discount never exceeds subtotal", () => {
    expect(checkCoupon({ ...base, type: "FLAT", value: 500000, maxDiscount: null }, ctx)).toEqual({ ok: true, discount: 100000 });
  });
  it("rejects expired, exhausted, wrong service, wrong time, min amount, first-booking", () => {
    expect(checkCoupon({ ...base, validTo: new Date("2026-09-01") }, ctx)).toMatchObject({ ok: false, message: "This coupon has expired." });
    expect(checkCoupon({ ...base, usageLimit: 5, usedCount: 5 }, ctx).ok).toBe(false);
    expect(checkCoupon({ ...base, serviceIds: ["other"] }, ctx).ok).toBe(false);
    expect(checkCoupon({ ...base, startMinute: 660, endMinute: 700 }, ctx).ok).toBe(false);
    expect(checkCoupon({ ...base, weekdays: [1, 2] }, ctx).ok).toBe(false);
    expect(checkCoupon({ ...base, minAmount: 200000 }, ctx).ok).toBe(false);
    expect(checkCoupon({ ...base, firstBookingOnly: true }, { ...ctx, customerPriorBookingsPlatform: 2 }).ok).toBe(false);
    expect(checkCoupon(base, { ...ctx, userUses: 1 }).ok).toBe(false);
  });
});

describe("quote", () => {
  it("charges GST on the discounted amount", () => {
    expect(computeQuote(40000, 8000, 18)).toEqual({ subtotal: 40000, discount: 8000, taxableAmount: 32000, tax: 5760, total: 37760, taxPercent: 18 });
  });
});

describe("refund policy", () => {
  const partial = { refundType: "PARTIAL" as const, cancellationTiers: [{ hoursBefore: 24, refundPercent: 100 }, { hoursBefore: 6, refundPercent: 50 }], noShowRefundPercent: 0 };
  it("tiers: >24h full, 6–24h half, <6h none", () => {
    expect(refundForCancellation(partial, 10000, 30).amount).toBe(10000);
    expect(refundForCancellation(partial, 10000, 10).amount).toBe(5000);
    expect(refundForCancellation(partial, 10000, 2).amount).toBe(0);
    expect(refundForCancellation(partial, 10000, -1).amount).toBe(0);
  });
  it("respects refund types", () => {
    expect(refundForCancellation({ ...partial, refundType: "NON_REFUNDABLE" }, 10000, 100).amount).toBe(0);
    expect(refundForCancellation({ ...partial, refundType: "REFUNDABLE" }, 10000, 1).amount).toBe(10000);
    expect(refundForCancellation({ ...partial, refundType: "TRANSFERABLE" }, 10000, 100).amount).toBe(0);
  });
  it("no-show refund percent", () => {
    expect(refundForNoShow(partial, 10000).amount).toBe(0);
    expect(refundForNoShow({ ...partial, noShowRefundPercent: 25 }, 10000).amount).toBe(2500);
  });
});
