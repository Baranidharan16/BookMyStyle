import { requireUser } from "@/server/auth/session";
import { listCustomerBookings } from "@/server/domain/bookings";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => {
  const user = await requireUser(["CUSTOMER"]);
  const tab = (req.nextUrl.searchParams.get("tab") ?? "all") as "upcoming" | "past" | "cancelled" | "all";
  return ok(await listCustomerBookings(user.id, ["upcoming", "past", "cancelled", "all"].includes(tab) ? tab : "all"));
});
