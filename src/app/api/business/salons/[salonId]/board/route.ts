import { getResourceBoard } from "@/server/domain/bookings";
import { ok } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";

export const GET = salonRoute(null, async ({ params }) => ok(await getResourceBoard(params.salonId), { headers: { "Cache-Control": "no-store" } }));
