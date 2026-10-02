import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { holidays } from "@/server/db/schema";
import { ok } from "@/server/http/handler";
import { salonRoute } from "@/server/http/salon-route";
import { channels, publish } from "@/server/realtime/publish";

export const DELETE = salonRoute<{ salonId: string; holidayId: string }>("OWNER", async ({ params }) => {
  await db.delete(holidays).where(and(eq(holidays.id, params.holidayId), eq(holidays.salonId, params.salonId)));
  await publish(db, { ch: channels.salonAvailability(params.salonId), type: "availability" });
  return ok({ deleted: true });
});
