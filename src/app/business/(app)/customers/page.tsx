"use client";
import { useQuery } from "@tanstack/react-query";
import { Search, UsersRound } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/utils";
import { formatDate } from "@/lib/time";
import { useDebounce } from "@/hooks/use-debounce";
import { useBiz } from "@/components/business/business-context";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/states";

type C = { key: string; name: string; phone: string | null; type: string; visits: number; spent: number; last_visit: string | null; first_visit: string; no_shows: number };

export default function CustomersPage() {
  const biz = useBiz();
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 300);
  const { data, isLoading } = useQuery({ queryKey: ["biz", "customers", biz.salonId, dq], queryFn: () => api.get<C[]>(biz.api(`/customers?q=${encodeURIComponent(dq)}`)) });
  return (
    <>
      <PageHeader title="Customers" description="Everyone who has booked or walked into your salon — only your salon's customers are visible here." actions={<div className="relative w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="h-10 pl-9" aria-label="Search customers" /></div>} />
      {isLoading ? <Skeleton className="h-80" /> : !data?.length ? <EmptyState icon={<UsersRound className="h-6 w-6" />} title="No customers found" /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-bold uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Visits</th><th className="px-4 py-3 text-right">Spent</th><th className="px-4 py-3">Last visit</th><th className="px-4 py-3">Customer since</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((c) => (
                <tr key={c.key}>
                  <td className="px-4 py-3"><p className="font-semibold">{c.name}</p><p className="text-xs text-muted">{c.phone ?? "—"}</p></td>
                  <td className="px-4 py-3"><Badge tone={c.type === "ONLINE" ? "info" : "accent"}>{c.type === "ONLINE" ? "Online" : "Walk-in"}</Badge>{c.no_shows > 0 && <Badge tone="danger" className="ml-1">{c.no_shows} no-show</Badge>}</td>
                  <td className="px-4 py-3 text-right font-semibold">{c.visits}</td>
                  <td className="px-4 py-3 text-right">{formatINR(c.spent)}</td>
                  <td className="px-4 py-3 text-ink-2">{c.last_visit ? formatDate(c.last_visit, biz.timezone) : "—"}</td>
                  <td className="px-4 py-3 text-ink-2">{formatDate(c.first_visit, biz.timezone, { weekday: undefined, year: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
