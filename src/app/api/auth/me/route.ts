import { getSessionUser } from "@/server/auth/session";
import { ok, route } from "@/server/http/handler";

export const GET = route(async () => ok({ user: await getSessionUser() }));
