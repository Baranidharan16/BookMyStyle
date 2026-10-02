import { listAreas } from "@/server/domain/salons";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => ok(await listAreas(req.nextUrl.searchParams.get("city") ?? undefined), { headers: { "Cache-Control": "public, max-age=3600" } }));
