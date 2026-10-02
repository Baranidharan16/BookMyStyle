"use client";
import { useMutation } from "@tanstack/react-query";
import { Camera, MapPin, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { profileSchema } from "@/lib/validation";
import { formatINR } from "@/lib/utils";
import { formatDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, Switch } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { PaymentStatusBadge } from "@/components/booking/status";
import { ThemeToggle } from "@/components/theme";
import { useUserLocation } from "@/components/location-context";

type Loc = { label: string; lat: number; lng: number; address?: string };
type Prefs = { notifyEmail?: boolean; notifySms?: boolean; notifyWhatsapp?: boolean; marketing?: boolean };

export function ProfileForm({ user, profile, payments }: { user: { name: string; email: string; phone: string | null; dateOfBirth: string | null; avatarUrl: string | null; createdAt: string }; profile: { savedLocations: Loc[]; preferences: Prefs }; payments: { id: string; amount: number; status: string; method: string | null; createdAt: string; code: string; bookingId: string; salonName: string }[] }) {
  const router = useRouter();
  const { location } = useUserLocation();
  const [form, setForm] = useState({ name: user.name, phone: user.phone ?? "", dateOfBirth: user.dateOfBirth ?? "", avatarUrl: user.avatarUrl });
  const [locs, setLocs] = useState<Loc[]>(profile.savedLocations);
  const [prefs, setPrefs] = useState<Prefs>({ notifyEmail: true, notifySms: true, notifyWhatsapp: false, marketing: false, ...profile.preferences });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.safeParse({ ...form, savedLocations: locs, preferences: prefs });
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      return api.patch("/api/customer/profile", parsed.data);
    },
    onSuccess: () => {
      toast.success("Profile saved");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del("/api/customer/profile"),
    onSuccess: () => {
      toast.success("Your account has been deleted.");
      window.location.href = "/";
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("folder", "avatars");
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message);
      setForm((f) => ({ ...f, avatarUrl: json.data.url }));
      toast.success("Photo uploaded — remember to save.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Profile & settings" description={`Member since ${formatDate(user.createdAt, undefined, { weekday: undefined, year: "numeric" })}`} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Personal details" />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={form.name || "U"} src={form.avatarUrl} size={64} />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
                <Camera className="h-4 w-4" /> {uploading ? "Uploading…" : "Change photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.name}>{(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
              <Field label="Mobile" error={errors.phone}>{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
              <Field label="Email" hint="Contact support to change your email.">{(p) => <Input {...p} value={user.email} disabled />}</Field>
              <Field label="Date of birth" optional error={errors.dateOfBirth}>{(p) => <Input {...p} type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />}</Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Saved locations" description="Quickly search salons near home, work and more." action={<Button size="sm" variant="secondary" onClick={() => setLocs([...locs, { label: location.label.split(",")[0] ?? "Saved", lat: location.lat, lng: location.lng, address: location.label }])} disabled={locs.length >= 10}><Plus className="h-4 w-4" /> Add current</Button>} />
          <CardBody className="space-y-2">
            {locs.length === 0 && <p className="text-sm text-muted">No saved locations.</p>}
            {locs.map((l, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-brand" />
                <Input className="h-9" value={l.label} onChange={(e) => setLocs(locs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Location label" />
                <span className="hidden truncate text-xs text-muted sm:block">{l.address}</span>
                <Button variant="ghost" size="iconSm" onClick={() => setLocs(locs.filter((_, j) => j !== i))} aria-label="Remove location"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Preferences" />
          <CardBody className="space-y-4">
            <Switch checked={!!prefs.notifyEmail} onChange={(v) => setPrefs({ ...prefs, notifyEmail: v })} label="Email updates" description="Booking confirmations and receipts" />
            <Switch checked={!!prefs.notifySms} onChange={(v) => setPrefs({ ...prefs, notifySms: v })} label="SMS reminders" description="Appointment reminders an hour before" />
            <Switch checked={!!prefs.notifyWhatsapp} onChange={(v) => setPrefs({ ...prefs, notifyWhatsapp: v })} label="WhatsApp updates" />
            <Switch checked={!!prefs.marketing} onChange={(v) => setPrefs({ ...prefs, marketing: v })} label="Offers & deals" description="Occasional offers from salons you visit" />
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Appearance</span><ThemeToggle /></div>
          </CardBody>
        </Card>

        <div className="flex justify-end"><Button size="lg" onClick={() => save.mutate()} loading={save.isPending}>Save changes</Button></div>

        <Card>
          <CardHeader title="Payments" description="Your recent transactions" />
          <CardBody>
            {payments.length === 0 ? <p className="text-sm text-muted">No payments yet.</p> : (
              <ul className="divide-y divide-line">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/customer/bookings/${p.bookingId}`} className="min-w-0 hover:text-brand">
                      <p className="truncate font-semibold">{p.salonName}</p>
                      <p className="text-xs text-muted">{p.code} · {formatDate(p.createdAt)} · {p.method?.toUpperCase() ?? "—"}</p>
                    </Link>
                    <span className="flex shrink-0 items-center gap-2"><span className="font-bold">{formatINR(p.amount)}</span><PaymentStatusBadge status={p.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="border-danger/30">
          <CardHeader title="Delete account" description="Removes your personal data. Past invoices are retained as required by law." action={<Button variant="dangerSoft" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>} />
          <div className="h-5" />
        </Card>
      </div>
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?" description="This can't be undone. Upcoming bookings must be cancelled first." footer={<><Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>Permanently delete</Button></>}>
        <p className="text-sm text-ink-2">Your name, phone, email and saved locations will be erased and you&apos;ll be signed out on all devices.</p>
      </Dialog>
    </div>
  );
}
