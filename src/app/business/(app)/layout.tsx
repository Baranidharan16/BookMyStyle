import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { salons } from "@/server/db/schema";
import { requirePageUser } from "@/server/auth/session";
import { getActiveSalonId } from "@/server/auth/access";
import { BusinessProvider } from "@/components/business/business-context";
import { BusinessShell } from "@/components/business/business-shell";

export default async function BusinessLayout({ children }: LayoutProps<"/business">) {
  const user = await requirePageUser(["OWNER"], "/business");
  const salonId = await getActiveSalonId(user);
  if (!salonId) redirect("/business/onboarding");
  const owned = await db.query.salons.findMany({ where: eq(salons.ownerId, user.id), columns: { id: true, name: true, status: true, timezone: true } });
  const salon = owned.find((s) => s.id === salonId)!;
  return (
    <BusinessProvider value={{ salonId, salonName: salon.name, timezone: salon.timezone, status: salon.status, level: "OWNER", staffId: null, permissions: ["CHECK_IN", "WALK_IN", "MANAGE_BOOKINGS", "VIEW_CUSTOMERS"], userId: user.id, basePath: "/business" }}>
      <BusinessShell user={user} salons={owned}>{children}</BusinessShell>
    </BusinessProvider>
  );
}
