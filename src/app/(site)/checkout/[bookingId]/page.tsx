import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePageUser } from "@/server/auth/session";
import { getBookingDetail } from "@/server/domain/bookings";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const user = await requirePageUser(["CUSTOMER"], `/checkout/${bookingId}`);
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) notFound();
  const d = await getBookingDetail(bookingId);
  if (!d || d.booking.customerId !== user.id) notFound();
  if (d.booking.status !== "PAYMENT_PENDING") redirect(`/customer/bookings/${bookingId}`);
  return (
    <CheckoutView
      booking={{ id: d.booking.id, code: d.booking.code, startsAt: d.booking.startsAt.toISOString(), endsAt: d.booking.endsAt.toISOString(), durationMinutes: d.booking.durationMinutes, subtotal: d.booking.subtotal, discount: d.booking.discount, tax: d.booking.tax, total: d.booking.total, lockExpiresAt: d.booking.lockExpiresAt?.toISOString() ?? null, requirements: d.booking.requirements }}
      salon={{ name: d.salon.name, timezone: d.salon.timezone, area: d.location?.area ?? "", citySlug: d.salon.citySlug, slug: d.salon.slug }}
      items={d.items.map((i) => ({ name: i.name, kind: i.kind, price: i.price, groupName: i.groupName }))}
      staff={d.staff.map((s) => s.name)}
      resources={d.resources.map((r) => r.name)}
      customer={{ name: user.name, email: user.email, phone: user.phone }}
    />
  );
}
