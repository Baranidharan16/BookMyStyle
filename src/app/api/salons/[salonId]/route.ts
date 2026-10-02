import { getSalonProfile } from "@/server/domain/salons";
import { ok, route } from "@/server/http/handler";
import { Errors } from "@/server/http/errors";
import { getPlatformConfig } from "@/server/settings";

/** GET /api/salons/:id — public salon profile incl. services, staff, offers, reviews. */
export const GET = route<{ salonId: string }>(async (_req, { params }) => {
  const { salonId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(salonId)) throw Errors.notFound("Salon");
  const p = await getSalonProfile(salonId);
  const cfg = await getPlatformConfig();
  if (!p || (p.salon.status !== "APPROVED" && !cfg.showUnapprovedSalons)) throw Errors.notFound("Salon");
  const { payoutDetails: _p, commissionPercent: _c, verificationNotes: _v, ...salon } = p.salon;
  return ok({ ...p, salon });
});
