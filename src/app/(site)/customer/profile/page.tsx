import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, customerProfiles, payments, salons, users } from "@/server/db/schema";
import { requirePageUser } from "@/server/auth/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile & settings" };

export default async function ProfilePage() {
  const user = await requirePageUser(["CUSTOMER"]);
  const [u, profile, pays] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, user.id), columns: { name: true, email: true, phone: true, dateOfBirth: true, avatarUrl: true, createdAt: true } }),
    db.query.customerProfiles.findFirst({ where: eq(customerProfiles.userId, user.id) }),
    db
      .select({ id: payments.id, amount: payments.amount, status: payments.status, method: payments.method, createdAt: payments.createdAt, code: bookings.code, bookingId: bookings.id, salonName: salons.name })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(salons, eq(salons.id, bookings.salonId))
      .where(eq(bookings.customerId, user.id))
      .orderBy(desc(payments.createdAt))
      .limit(20),
  ]);
  return <ProfileForm user={JSON.parse(JSON.stringify(u))} profile={JSON.parse(JSON.stringify(profile ?? { savedLocations: [], preferences: {} }))} payments={JSON.parse(JSON.stringify(pays))} />;
}
