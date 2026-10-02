"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Power, Sofa, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { resourceTypeSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { useBiz } from "@/components/business/business-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/states";

type T = { id: string; name: string; area: string | null; resources: { id: string; name: string; active: boolean }[] };

export default function ResourcesPage() {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["biz", "resource-types", biz.salonId], queryFn: () => api.get<T[]>(biz.api("/resource-types")) });
  const [addOpen, setAddOpen] = useState(false);
  const inv = () => qc.invalidateQueries({ queryKey: ["biz"] });
  const toggle = useMutation({ mutationFn: (r: { id: string; active: boolean }) => api.patch(biz.api(`/resources/${r.id}`), { active: r.active }), onSuccess: inv, onError: (e) => toast.error(errorMessage(e)) });
  const rename = useMutation({ mutationFn: (r: { id: string; name: string }) => api.patch(biz.api(`/resources/${r.id}`), { name: r.name }), onSuccess: () => { inv(); toast.success("Renamed"); }, onError: (e) => toast.error(errorMessage(e)) });
  const addOne = useMutation({ mutationFn: (t: T) => api.post(biz.api("/resources"), { resourceTypeId: t.id, name: `${t.name.split(" ").pop()} ${t.resources.length + 1}` }), onSuccess: inv, onError: (e) => toast.error(errorMessage(e)) });
  const delType = useMutation({ mutationFn: (id: string) => api.del(biz.api(`/resource-types/${id}`)), onSuccess: () => { inv(); toast.success("Removed"); }, onError: (e) => toast.error(errorMessage(e)) });

  return (
    <>
      <PageHeader title="Seats & resources" description="Chairs, beds, stations and rooms. Each service declares which resource types it needs — the booking engine only assigns compatible, free resources." actions={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add resource type</Button>} />
      {isLoading ? <Skeleton className="h-64" /> : !data?.length ? (
        <EmptyState icon={<Sofa className="h-6 w-6" />} title="No resources yet" description="Add your chairs, facial beds, pedicure stations or rooms to start taking bookings." action={<Button onClick={() => setAddOpen(true)}>Add resource type</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{t.name}</h2>
                  <p className="text-xs text-muted">{t.area ?? "No area"} · {t.resources.filter((r) => r.active).length} active</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="soft" onClick={() => addOne.mutate(t)} loading={addOne.isPending}><Plus className="h-4 w-4" /> Add</Button>
                  <Button size="iconSm" variant="ghost" onClick={() => confirm(`Remove ${t.name}?`) && delType.mutate(t.id)} aria-label={`Delete ${t.name}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {t.resources.map((r) => (
                  <li key={r.id} className={cn("flex items-center gap-2 rounded-xl border border-line p-2", !r.active && "opacity-60")}>
                    <input defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && rename.mutate({ id: r.id, name: e.target.value.trim() })} className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1 text-sm font-semibold focus:bg-surface-2 focus:outline-none" aria-label="Resource name" />
                    {!r.active && <Badge>Inactive</Badge>}
                    <Button size="iconSm" variant="ghost" onClick={() => toggle.mutate({ id: r.id, active: !r.active })} aria-label={r.active ? "Deactivate" : "Activate"} title={r.active ? "Deactivate" : "Activate"}><Power className={cn("h-4 w-4", r.active ? "text-success" : "text-muted")} /></Button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <AddTypeDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function AddTypeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "Haircut Chair", area: "Haircut Area", count: "4" });
  const [err, setErr] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => {
      const p = resourceTypeSchema.safeParse(f);
      if (!p.success) {
        setErr(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
        throw new Error("Please fix the form");
      }
      return api.post(biz.api("/resource-types"), p.data);
    },
    onSuccess: () => { toast.success("Resources added"); qc.invalidateQueries({ queryKey: ["biz"] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Add resource type" footer={<Button onClick={() => m.mutate()} loading={m.isPending}>Add</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">{["Haircut Chair", "Facial Bed", "Manicure Station", "Pedicure Chair", "Spa Room", "Makeup Room"].map((n) => <button key={n} type="button" onClick={() => setF({ ...f, name: n })} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-brand">{n}</button>)}</div>
        <Field label="Type name" error={err.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Area / zone" optional hint="Groups resources on the live board, e.g. ‘Nail Bar’.">{(p) => <Input {...p} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />}</Field>
        <Field label="How many?" error={err.count}>{(p) => <Input {...p} type="number" min={0} max={50} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}
