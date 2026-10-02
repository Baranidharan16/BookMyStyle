"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Pencil, Plus, Scissors, Settings2, Sofa, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { formatDuration, formatINR } from "@/lib/utils";
import { useBiz } from "@/components/business/business-context";
import { ServiceDialog, type ServiceRow } from "@/components/business/service-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/states";

export default function ServicesPage() {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["biz", "services", biz.salonId], queryFn: () => api.get<ServiceRow[]>(biz.api("/services")) });
  const [edit, setEdit] = useState<ServiceRow | "new" | null>(null);
  const toggle = useMutation({
    mutationFn: (s: ServiceRow) => (s.active ? api.del(biz.api(`/services/${s.id}`)) : api.put(biz.api(`/services/${s.id}`), { ...s, active: true, requirements: s.requirements.map((r) => ({ resourceTypeId: r.resourceTypeId, quantity: r.quantity })), optionGroups: s.optionGroups.map((g) => ({ ...g, options: g.options.map((o) => ({ name: o.name, priceDelta: o.priceDelta, durationDelta: o.durationDelta })) })) })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["biz"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Services" description="Price, duration, buffer, required resources, eligible staff and customer options." actions={<Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Add service</Button>} />
      {isLoading ? <Skeleton className="h-64" /> : !data?.length ? (
        <EmptyState icon={<Scissors className="h-6 w-6" />} title="No services yet" action={<Button onClick={() => setEdit("new")}>Add a service</Button>} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {data.map((s) => (
              <li key={s.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${s.active ? "" : "opacity-55"}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold">{s.name} {!s.active && <Badge>Inactive</Badge>}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                    <span className="font-bold text-ink">{formatINR(s.price)}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(s.durationMinutes)}{s.bufferMinutes ? ` + ${s.bufferMinutes}m buffer` : ""}{s.prepMinutes ? ` + ${s.prepMinutes}m prep` : ""}</span>
                    <span className="inline-flex items-center gap-1"><Sofa className="h-3.5 w-3.5" />{s.requirements.map((r) => `${r.quantity}× ${r.name}`).join(", ") || "No resource"}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.staffIds.length} staff{s.staffRequired > 1 ? ` · needs ${s.staffRequired}` : ""}</span>
                    {s.optionGroups.length > 0 && <span className="inline-flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" />{s.optionGroups.map((g) => g.name).join(", ")}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEdit(s)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate(s)}>{s.active ? "Deactivate" : "Activate"}</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {edit && <ServiceDialog service={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
