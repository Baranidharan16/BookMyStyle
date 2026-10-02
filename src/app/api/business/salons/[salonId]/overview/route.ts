import { getTodayOverview } from "@/server/domain/analytics";
import { ok } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";

export const GET = salonRoute(null, async ({ params }) => ok(await getTodayOverview(params.salonId)));
