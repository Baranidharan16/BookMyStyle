import { getAnalytics } from "@/server/domain/analytics";
import { ok } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";

export const GET = salonRoute("OWNER", async ({ req, params }) => {
  const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  return ok(await getAnalytics(params.salonId, days));
});
