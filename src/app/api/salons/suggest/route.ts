import { suggest } from "@/server/domain/salons";
import { ok, route } from "@/server/http/handler";

export const GET = route(async (req) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  return ok(await suggest(q), { headers: { "Cache-Control": "public, max-age=30" } });
});
