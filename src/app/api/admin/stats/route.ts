import { requireUser } from "@/server/auth/session";
import { getPlatformStats } from "@/server/domain/admin";
import { ok, route } from "@/server/http/handler";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  return ok(await getPlatformStats());
});
