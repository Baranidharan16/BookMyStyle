"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api-client";
import { formatDate } from "@/lib/time";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Segmented } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";

type U = { id: string; name: string; email: string; phone: string | null; role: string; status: string; createdAt: string; lastLoginAt: string | null };

export default function AdminUsers() {
  const qc = useQueryClient();
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "users", role, dq, page], queryFn: () => api.get<{ items: U[]; total: number }>(`/api/admin/users${qs({ role, q: dq, page })}`) });
  const m = useMutation({ mutationFn: (v: { id: string; status: string }) => api.patch(`/api/admin/users/${v.id}`, { status: v.status }), onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin"] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title="Users" description={data ? `${data.total} accounts` : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented size="sm" value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "CUSTOMER", label: "Customers" }, { value: "OWNER", label: "Owners" }, { value: "STAFF", label: "Staff" }, { value: "ADMIN", label: "Admins" }]} />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, email or phone" className="h-9 w-64" aria-label="Search users" />
      </div>
      {isLoading ? <Skeleton className="h-64" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-bold uppercase text-muted"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Last login</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3"><p className="font-semibold">{u.name}</p><p className="text-xs text-muted">{u.email} · {u.phone ?? "—"}</p></td>
                  <td className="px-4 py-3"><Badge>{u.role}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{u.status}</Badge></td>
                  <td className="px-4 py-3">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">{u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"}</td>
                  <td className="px-4 py-3 text-right">{u.role !== "ADMIN" && u.status !== "DELETED" && <Button size="sm" variant={u.status === "ACTIVE" ? "dangerSoft" : "secondary"} onClick={() => m.mutate({ id: u.id, status: u.status === "ACTIVE" ? "BLOCKED" : "ACTIVE" })}>{u.status === "ACTIVE" ? "Block" : "Unblock"}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="mt-4 flex justify-center gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={!data || page * 30 >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>
    </>
  );
}
