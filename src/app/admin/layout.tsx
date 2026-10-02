import { requirePageUser } from "@/server/auth/session";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageUser(["ADMIN"], "/admin");
  return <AdminShell user={user}>{children}</AdminShell>;
}
