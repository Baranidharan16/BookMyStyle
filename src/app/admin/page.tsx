import type { Metadata } from "next";
import Link from "next/link";
import { getPlatformStats } from "@/server/domain/admin";
import { PageHeader, Stat, Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";
import { AdminChart } from "./admin-chart";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const s = (await getPlatformStats()) as unknown as Record<string, number> & { daily: { day: string; bookings: number; gmv: number }[] };
  return (
    <>
      <PageHeader title="Platform overview" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total users" value={s.users} hint={`${s.customers} customers`} />
        <Stat label="Active users (30d)" value={s.active_users} tone="info" />
        <Stat label="Salons" value={s.salons} hint={`${s.active_salons} active`} tone="brand" />
        <Stat label="Pending verification" value={<Link href="/admin/salons?status=PENDING" className="hover:text-brand">{s.pending_salons}</Link>} tone="warning" />
        <Stat label="Bookings today" value={s.bookings_today} tone="success" />
        <Stat label="GMV (30d, online)" value={formatINR(s.gmv_30d)} />
        <Stat label="Platform commission (30d)" value={formatINR(s.commission_30d)} tone="success" />
        <Stat label="Attention needed" value={s.failed_refunds + s.flagged_reviews + s.open_disputes} hint={`${s.failed_refunds} failed refunds · ${s.flagged_reviews} flagged · ${s.open_disputes} disputes`} tone="danger" />
      </div>
      <Card className="mt-6"><CardHeader title="Online bookings & GMV — last 30 days" /><CardBody className="h-72"><AdminChart data={s.daily} /></CardBody></Card>
    </>
  );
}
