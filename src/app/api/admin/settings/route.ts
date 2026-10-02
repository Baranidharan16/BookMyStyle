import { z } from "zod";
import { db } from "@/server/db";
import { platformSettings } from "@/server/db/schema";
import { requireUser } from "@/server/auth/session";
import { ok, parseBody, route } from "@/server/http/handler";
import { audit } from "@/server/audit";
import { getPlatformConfig } from "@/server/settings";

const planNum = z.object({ FREE: z.number().min(0), PRO: z.number().min(0), PREMIUM: z.number().min(0) });
const schema = z.object({
  gstPercent: z.number().min(0).max(28),
  defaultCommissionPercent: z.number().min(0).max(50),
  planCommission: planNum,
  planMonthlyFee: planNum,
  showUnapprovedSalons: z.boolean(),
  featuredListingFee: z.number().int().min(0),
  supportEmail: z.string().email(),
});

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  return ok(await getPlatformConfig());
});

export const PUT = route(async (req) => {
  const admin = await requireUser(["ADMIN"]);
  const input = await parseBody(req, schema);
  const before = await getPlatformConfig();
  await db.insert(platformSettings).values({ key: "config", value: input }).onConflictDoUpdate({ target: platformSettings.key, set: { value: input } });
  await audit(db, { actorId: admin.id, action: "admin.settings_changed", entity: "platform_settings", entityId: "config", oldValue: before, newValue: input });
  return ok(input);
});
