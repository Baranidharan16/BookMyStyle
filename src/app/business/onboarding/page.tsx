import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { salons } from "@/server/db/schema";
import { requirePageUser } from "@/server/auth/session";
import { getActiveSalonId } from "@/server/auth/access";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up your salon" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ fresh?: string }> }) {
  const user = await requirePageUser(["OWNER"], "/business/onboarding");
  const { fresh } = await searchParams;
  const salonId = fresh ? null : await getActiveSalonId(user);
  const salon = salonId ? await db.query.salons.findFirst({ where: eq(salons.id, salonId), columns: { id: true, name: true, status: true, onboardingStep: true, timezone: true, verificationNotes: true } }) : null;
  return <OnboardingWizard user={{ id: user.id, name: user.name, email: user.email, phone: user.phone }} salon={salon ?? null} />;
}
