import { listSalonBookings } from "@/server/domain/bookings";
import { ok } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";

export const GET = salonRoute(null, async ({ req, params, access }) => {
  const sp = req.nextUrl.searchParams;
  const data = await listSalonBookings(params.salonId, {
    date: sp.get("date") ?? undefined,
    status: sp.get("status") ?? undefined,
    source: sp.get("source") ?? undefined,
    q: sp.get("q") ?? undefined,
    page: Number(sp.get("page") ?? 1),
    // staff without MANAGE_BOOKINGS only see their own appointments
    staffId: access.level === "STAFF" && !access.permissions.has("MANAGE_BOOKINGS") ? access.staffId ?? undefined : sp.get("staffId") ?? undefined,
  });
  if (!access.permissions.has("VIEW_CUSTOMERS")) data.items = data.items.map((b) => ({ ...b, customerPhone: b.customerPhone ? `••••••${b.customerPhone.slice(-4)}` : null }));
  return ok(data);
});
