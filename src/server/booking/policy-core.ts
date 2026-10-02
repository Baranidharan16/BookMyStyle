/** Pure pricing / coupon / refund rules (unit-tested, no I/O). */

export type CouponRule = {
  type: "PERCENT" | "FLAT";
  value: number;
  maxDiscount: number | null;
  minAmount: number;
  validFrom: Date;
  validTo: Date;
  startMinute: number | null;
  endMinute: number | null;
  weekdays: number[] | null;
  serviceIds: string[] | null;
  firstBookingOnly: boolean;
  newCustomerOnly: boolean;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  active: boolean;
};

export type CouponContext = {
  now: Date;
  subtotal: number;
  serviceId: string;
  appointmentWeekday: number;
  appointmentMinute: number;
  userUses: number;
  customerPriorBookingsPlatform: number;
  customerPriorBookingsSalon: number;
};

export type CouponCheck = { ok: true; discount: number } | { ok: false; message: string };

export function checkCoupon(c: CouponRule, x: CouponContext): CouponCheck {
  if (!c.active) return { ok: false, message: "This coupon is no longer active." };
  if (x.now < c.validFrom) return { ok: false, message: "This coupon isn't valid yet." };
  if (x.now > c.validTo) return { ok: false, message: "This coupon has expired." };
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return { ok: false, message: "This coupon has reached its usage limit." };
  if (x.userUses >= c.perUserLimit) return { ok: false, message: "You've already used this coupon." };
  if (c.serviceIds?.length && !c.serviceIds.includes(x.serviceId)) return { ok: false, message: "This coupon doesn't apply to the selected service." };
  if (c.weekdays?.length && !c.weekdays.includes(x.appointmentWeekday)) return { ok: false, message: "This coupon isn't valid on the selected day." };
  if (c.startMinute != null && c.endMinute != null && (x.appointmentMinute < c.startMinute || x.appointmentMinute >= c.endMinute)) {
    return { ok: false, message: "This coupon is only valid for appointments in a specific time window." };
  }
  if (x.subtotal < c.minAmount) return { ok: false, message: `Add services worth ₹${Math.ceil(c.minAmount / 100)} or more to use this coupon.` };
  if (c.firstBookingOnly && x.customerPriorBookingsPlatform > 0) return { ok: false, message: "This coupon is only for your first booking." };
  if (c.newCustomerOnly && x.customerPriorBookingsSalon > 0) return { ok: false, message: "This coupon is only for new customers of this salon." };
  let discount = c.type === "PERCENT" ? Math.floor((x.subtotal * c.value) / 100) : c.value;
  if (c.maxDiscount != null) discount = Math.min(discount, c.maxDiscount);
  discount = Math.min(discount, x.subtotal);
  return { ok: true, discount };
}

export type Quote = { subtotal: number; discount: number; taxableAmount: number; tax: number; total: number; taxPercent: number };

/** GST is charged on the discounted amount; rounding to the nearest paisa. */
export function computeQuote(subtotal: number, discount: number, taxPercent: number): Quote {
  const d = Math.max(0, Math.min(discount, subtotal));
  const taxable = subtotal - d;
  const tax = Math.round((taxable * taxPercent) / 100);
  return { subtotal, discount: d, taxableAmount: taxable, tax, total: taxable + tax, taxPercent };
}

export type RefundPolicy = {
  refundType: "REFUNDABLE" | "PARTIAL" | "NON_REFUNDABLE" | "TRANSFERABLE";
  cancellationTiers: { hoursBefore: number; refundPercent: number }[];
  noShowRefundPercent: number;
};

export type RefundDecision = { percent: number; amount: number; explanation: string };

/** How much of `paid` is refunded when the customer cancels `hoursBefore` hours ahead. */
export function refundForCancellation(policy: RefundPolicy, paid: number, hoursBefore: number): RefundDecision {
  if (paid <= 0) return { percent: 0, amount: 0, explanation: "No payment was collected." };
  if (hoursBefore <= 0) return { percent: 0, amount: 0, explanation: "Appointments can't be refunded after the start time." };
  switch (policy.refundType) {
    case "REFUNDABLE":
      return { percent: 100, amount: paid, explanation: "Full refund as per salon policy." };
    case "NON_REFUNDABLE":
      return { percent: 0, amount: 0, explanation: "This salon's bookings are non-refundable." };
    case "TRANSFERABLE":
      return { percent: 0, amount: 0, explanation: "This salon doesn't refund cancellations, but you can reschedule to another slot instead." };
    case "PARTIAL": {
      const tier = [...policy.cancellationTiers].sort((a, b) => b.hoursBefore - a.hoursBefore).find((t) => hoursBefore >= t.hoursBefore);
      const pct = tier?.refundPercent ?? 0;
      const amount = Math.floor((paid * pct) / 100);
      return {
        percent: pct,
        amount,
        explanation: tier
          ? `${pct}% refund for cancelling at least ${tier.hoursBefore} hours before the appointment.`
          : "No refund for cancellations this close to the appointment.",
      };
    }
  }
}

export function refundForNoShow(policy: RefundPolicy, paid: number): RefundDecision {
  const pct = Math.max(0, Math.min(100, policy.noShowRefundPercent));
  return { percent: pct, amount: Math.floor((paid * pct) / 100), explanation: pct ? `${pct}% refunded for no-show.` : "No refund for no-shows." };
}
