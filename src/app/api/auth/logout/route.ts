import { destroySession } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const POST = route(async () => {
  await destroySession();
  return ok({ redirect: "/" });
});
