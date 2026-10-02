import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requirePageUser } from "@/server/auth/session";
import { getBookingDetail } from "@/server/domain/bookings";
import { BookingLive } from "./booking-live";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ bookingId: string }>; searchParams: Promise<{ confirmed?: string }> }) {
  const { bookingId } = await params;
  const { confirmed } = await searchParams;
  const user = await requirePageUser(["CUSTOMER"]);
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) notFound();
  const d = await getBookingDetail(bookingId);
  if (!d || d.booking.customerId !== user.id) notFound();
  // QR payload: booking code + secret check-in token, scanned by salon staff
  const qr = await QRCode.toString(JSON.stringify({ t: "bms", c: d.booking.code, k: d.booking.checkInToken }), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b1520", light: "#ffffff" } });
  return <BookingLive bookingId={bookingId} initial={JSON.parse(JSON.stringify(d))} qrSvg={qr} justConfirmed={confirmed === "1"} customerName={user.name} />;
}
