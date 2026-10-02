import { z } from "zod";
import { getAvailability } from "@/server/domain/salons";
import { ok, parseQuery, route } from "@/server/http/handler";

const schema = z.object({
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  optionIds: z.string().optional(),
  staffId: z.string().uuid().optional(),
});

/** GET /api/salons/:id/availability — computed live by the booking engine. Never cached. */
export const GET = route<{ salonId: string }>(async (req, { params }) => {
  const { salonId } = await params;
  const q = parseQuery(req, schema);
  const data = await getAvailability({
    salonId,
    serviceId: q.serviceId,
    date: q.date,
    optionIds: q.optionIds ? q.optionIds.split(",").filter(Boolean) : [],
    staffPreference: q.staffId ?? null,
  });
  return ok(data, { headers: { "Cache-Control": "no-store" } });
});
