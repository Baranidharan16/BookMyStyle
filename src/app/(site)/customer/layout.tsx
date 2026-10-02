import { requirePageUser } from "@/server/auth/session";

export default async function CustomerLayout({ children }: LayoutProps<"/customer">) {
  await requirePageUser(["CUSTOMER"], "/customer/dashboard");
  return <>{children}</>;
}
