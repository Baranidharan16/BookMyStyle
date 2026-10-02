import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { listCustomerBookings } from "@/server/domain/bookings";
import { CustomerDashboard } from "./customer-dashboard";

export const metadata: Metadata = { title: "My bookings" };

export default async function Page() {
  const user = await requirePageUser(["CUSTOMER"]);
  const all = await listCustomerBookings(user.id, "all", 100);
  return <CustomerDashboard name={user.name} userId={user.id} initial={JSON.parse(JSON.stringify(all))} />;
}
