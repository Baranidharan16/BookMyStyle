import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { bookings, payments, salons } from "@/server/db/schema";
import { requirePageUser } from "@/server/auth/session";
import { activeProviderName } from "@/server/payments";
import { SandboxGateway } from "./sandbox-gateway";

export const metadata: Metadata = { title: "Sandbox payment (test mode)", robots: { index: false } };

/** Development-only stand-in for a hosted payment page. Disabled unless PAYMENT_PROVIDER=sandbox. */
export default async function SandboxPayPage({ params }: { params: Promise<{ orderId: string }> }) {
  if (activeProviderName() !== "sandbox") notFound();
  const { orderId } = await params;
  const user = await requirePageUser(["CUSTOMER"], `/pay/sandbox/${orderId}`);
  const rows = await db
    .select({ amount: payments.amount, bookingId: bookings.id, code: bookings.code, salonName: salons.name, customerId: bookings.customerId, lockExpiresAt: bookings.lockExpiresAt })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(salons, eq(salons.id, bookings.salonId))
    .where(and(eq(payments.providerOrderId, orderId), eq(payments.provider, "sandbox")));
  const r = rows[0];
  if (!r || r.customerId !== user.id) notFound();
  return <SandboxGateway orderId={orderId} amount={r.amount} bookingId={r.bookingId} code={r.code} salonName={r.salonName} lockExpiresAt={r.lockExpiresAt?.toISOString() ?? null} />;
}
