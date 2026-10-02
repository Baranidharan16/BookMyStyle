import { getCalendar } from "@/server/domain/bookings";
import { ok } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { salonRoute } from "@/server/http/salon-route";
import { isValidDateKey } from "@/lib/time";

export const GET = salonRoute(null, async ({ req, params }) => {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const days = Math.min(42, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 1)));
  if (!isValidDateKey(from)) throw Errors.validation("Invalid date");
  return ok(await getCalendar(params.salonId, from, days));
});
