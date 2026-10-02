"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { formatDate, formatTime } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

type A = { id: string; action: string; entity: string; entityId: string | null; createdAt: string; actorName: string | null; actorRole: string | null; salonName: string | null };

export default function AdminAudit() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "audit"], queryFn: () => api.get<A[]>("/api/admin/audit") });
  return (
    <>
      <PageHeader title="Audit log" description="Latest 200 security- and money-relevant actions across the platform." />
      {isLoading ? <Skeleton className="h-96" /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm">
          <thead className="bg-surface-2 text-left text-xs font-bold uppercase text-muted"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Salon</th><th className="px-4 py-3">Entity</th></tr></thead>
          <tbody className="divide-y divide-line">{data?.map((a) => (
            <tr key={a.id}><td className="whitespace-nowrap px-4 py-2 text-xs">{formatDate(a.createdAt)} {formatTime(a.createdAt)}</td><td className="px-4 py-2 font-mono text-xs font-semibold text-brand">{a.action}</td><td className="px-4 py-2">{a.actorName ?? "System"} <span className="text-xs text-muted">{a.actorRole?.toLowerCase()}</span></td><td className="px-4 py-2">{a.salonName ?? "—"}</td><td className="px-4 py-2 font-mono text-[11px] text-muted">{a.entity}:{a.entityId?.slice(0, 8)}</td></tr>
          ))}</tbody>
        </table></Card>
      )}
    </>
  );
}
