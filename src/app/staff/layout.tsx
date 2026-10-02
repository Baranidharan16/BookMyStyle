import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { salons, staff } from "@/server/db/schema";
import { requirePageUser } from "@/server/auth/session";
import { BusinessProvider } from "@/components/business/business-context";
import { StaffShell } from "./staff-shell";

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const user = await requirePageUser(["STAFF"], "/staff");
  const me = await db.query.staff.findFirst({ where: and(eq(staff.userId, user.id), eq(staff.active, true)) });
  if (!me) redirect("/login");
  const salon = await db.query.salons.findFirst({ where: eq(salons.id, me.salonId), columns: { id: true, name: true, timezone: true, status: true } });
  return (
    <BusinessProvider value={{ salonId: salon!.id, salonName: salon!.name, timezone: salon!.timezone, status: salon!.status, level: "STAFF", staffId: me.id, permissions: me.permissions, userId: user.id, basePath: "/staff" }}>
      <StaffShell user={user} staffName={me.name} title={me.title}>{children}</StaffShell>
    </BusinessProvider>
  );
}
