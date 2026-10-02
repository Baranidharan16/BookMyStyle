"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, PartyPopper, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { cn, formatINR } from "@/lib/utils";
import { profileSchema, salonProfileSchema, staffSchema } from "@/lib/validation";
import { BusinessProvider, useBiz } from "@/components/business/business-context";
import { HoursSection, LocationSection, PayoutSection, PoliciesSection, ProfileSection } from "@/components/business/settings-sections";
import { ServiceDialog, type ServiceRow } from "@/components/business/service-dialog";
import { Logo } from "@/components/ui/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

const STEPS = ["Owner information", "Salon information", "Location", "Business hours", "Seats & resources", "Staff", "Services", "Payment & bank", "Policies", "Verification"];

type SalonLite = { id: string; name: string; status: string; onboardingStep: number; timezone: string; verificationNotes: string | null } | null;

export function OnboardingWizard({ user, salon }: { user: { id: string; name: string; email: string; phone: string | null }; salon: SalonLite }) {
  const [step, setStep] = useState(salon ? Math.min(10, Math.max(3, salon.onboardingStep)) : 1);
  const done = salon?.onboardingStep ?? 0;
  const go = (n: number) => { setStep(Math.max(1, Math.min(10, n))); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/"><Logo /></Link>
          {salon && <Link href="/business" className="text-sm font-semibold text-muted hover:text-ink">Go to dashboard →</Link>}
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Onboarding progress">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Salon setup</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(Math.max(done - 1, step - 1) / 10) * 100}%` }} /></div>
          <p className="mt-1 text-xs text-muted">Step {step} of 10</p>
          <ol className="mt-4 flex gap-1 overflow-x-auto lg:flex-col">
            {STEPS.map((s, i) => {
              const n = i + 1;
              const complete = n < done || (n === 1 && !!salon) || (n === 2 && !!salon);
              const locked = !salon && n > 2;
              return (
                <li key={s} className="shrink-0">
                  <button disabled={locked} onClick={() => go(n)} aria-current={step === n ? "step" : undefined} className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:opacity-40", step === n ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2")}>
                    {complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0" />}
                    <span className="whitespace-nowrap">{n}. {s}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <main id="main" className="min-w-0">
          <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">{STEPS[step - 1]}</h1>
          {step === 1 && <OwnerStep user={user} onNext={() => go(2)} />}
          {step === 2 && !salon && <CreateSalonStep />}
          {salon && step >= 2 && (
            <BusinessProvider value={{ salonId: salon.id, salonName: salon.name, timezone: salon.timezone, status: salon.status, level: "OWNER", staffId: null, permissions: ["CHECK_IN", "WALK_IN", "MANAGE_BOOKINGS", "VIEW_CUSTOMERS"], userId: user.id, basePath: "/business" }}>
              {step === 2 && <ProfileSection onSaved={() => go(3)} />}
              {step === 3 && <LocationSection onSaved={() => go(4)} />}
              {step === 4 && <HoursSection onSaved={() => go(5)} />}
              {step === 5 && <ResourcesStep onNext={() => go(6)} />}
              {step === 6 && <StaffStep onNext={() => go(7)} />}
              {step === 7 && <ServicesStep onNext={() => go(8)} />}
              {step === 8 && <PayoutSection onSaved={() => go(9)} />}
              {step === 9 && <PoliciesSection onSaved={() => go(10)} />}
              {step === 10 && <VerifyStep salon={salon} />}
            </BusinessProvider>
          )}
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 1}><ArrowLeft className="h-4 w-4" /> Back</Button>
            {step < 10 && (salon || step < 2) && <Button variant="secondary" onClick={() => go(step + 1)}>Skip for now <ArrowRight className="h-4 w-4" /></Button>}
          </div>
        </main>
      </div>
    </div>
  );
}

function OwnerStep({ user, onNext }: { user: { name: string; email: string; phone: string | null }; onNext: () => void }) {
  const [f, setF] = useState({ name: user.name, phone: user.phone ?? "" });
  const m = useMutation({
    mutationFn: () => { const p = profileSchema.safeParse(f); if (!p.success) throw new Error(p.error.issues[0]!.message); return api.patch("/api/customer/profile", p.data); },
    onSuccess: onNext,
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card><CardHeader title="Your details" description="Used for account security and platform communication." /><CardBody className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Mobile">{(p) => <Input {...p} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
        <Field label="Email">{(p) => <Input {...p} value={user.email} disabled />}</Field>
      </div>
      <Button onClick={() => m.mutate()} loading={m.isPending}>Save & continue <ArrowRight className="h-4 w-4" /></Button>
    </CardBody></Card>
  );
}

function CreateSalonStep() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", city: "Chennai", genderType: "UNISEX", tagline: "", phone: "" });
  const m = useMutation({
    mutationFn: () => {
      const p = salonProfileSchema.extend({}).safeParse({ ...f, brandColor: "#a3214f", amenities: [] });
      if (!p.success) throw new Error(p.error.issues[0]!.message);
      return api.post("/api/business/salons", { ...p.data, city: f.city });
    },
    onSuccess: () => { toast.success("Salon created"); router.replace("/business/onboarding"); router.refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card><CardHeader title="Tell us about your salon" /><CardBody className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Salon name">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Urban Cuts" />}</Field>
        <Field label="City">{(p) => <Select {...p} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}><option>Chennai</option><option>Bengaluru</option><option>Hyderabad</option><option>Mumbai</option><option>Delhi</option><option>Pune</option><option>Kochi</option><option>Coimbatore</option></Select>}</Field>
        <Field label="Serves">{(p) => <Select {...p} value={f.genderType} onChange={(e) => setF({ ...f, genderType: e.target.value })}><option value="UNISEX">Everyone</option><option value="MEN">Men</option><option value="WOMEN">Women</option></Select>}</Field>
        <Field label="Salon phone" optional>{(p) => <Input {...p} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
      </div>
      <Field label="Tagline" optional>{(p) => <Input {...p} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} placeholder="Sharp cuts. Sharper service." />}</Field>
      <Button onClick={() => m.mutate()} loading={m.isPending}>Create salon <ArrowRight className="h-4 w-4" /></Button>
    </CardBody></Card>
  );
}

function ResourcesStep({ onNext }: { onNext: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["biz", "resource-types", biz.salonId], queryFn: () => api.get<{ id: string; name: string; area: string | null; resources: { id: string }[] }[]>(biz.api("/resource-types")) });
  const [f, setF] = useState({ name: "Haircut Chair", area: "Haircut Area", count: 4 });
  const m = useMutation({ mutationFn: () => api.post(biz.api("/resource-types"), f), onSuccess: () => { toast.success(`${f.count} × ${f.name} added`); qc.invalidateQueries({ queryKey: ["biz"] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card><CardHeader title="Seats, beds, stations & rooms" description="E.g. 6 haircut chairs, 2 facial beds, 1 bridal makeup room." /><CardBody className="space-y-4">
      {data.length > 0 && <ul className="flex flex-wrap gap-2">{data.map((t) => <li key={t.id}><Badge tone="brand">{t.resources.length} × {t.name}</Badge></li>)}</ul>}
      <div className="flex flex-wrap gap-1.5">{["Haircut Chair", "Facial Bed", "Manicure Station", "Pedicure Chair", "Spa Room", "Makeup Room"].map((n) => <button key={n} type="button" onClick={() => setF({ ...f, name: n, area: n.includes("Chair") && n.startsWith("Hair") ? "Haircut Area" : n.includes("Facial") ? "Facial Area" : n.includes("Makeup") ? "Bridal Suite" : n.includes("Spa") ? "Spa" : "Nail Bar" })} className="rounded-full border border-line px-3 py-1 text-xs hover:border-brand">{n}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px_auto] sm:items-end">
        <Field label="Type">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Area">{(p) => <Input {...p} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />}</Field>
        <Field label="Count">{(p) => <Input {...p} type="number" min={1} max={50} value={f.count} onChange={(e) => setF({ ...f, count: Number(e.target.value) })} />}</Field>
        <Button onClick={() => m.mutate()} loading={m.isPending}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <Button onClick={onNext} disabled={!data.length}>Continue <ArrowRight className="h-4 w-4" /></Button>
    </CardBody></Card>
  );
}

function StaffStep({ onNext }: { onNext: () => void }) {
  const biz = useBiz();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["biz", "staff", biz.salonId], queryFn: () => api.get<{ id: string; name: string; title: string }[]>(biz.api("/staff")) });
  const [f, setF] = useState({ name: "", title: "Stylist", start: "10:00", end: "20:00" });
  const parse = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const m = useMutation({
    mutationFn: () => {
      const p = staffSchema.safeParse({ name: f.name, title: f.title, schedule: [1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, shifts: [{ start: parse(f.start), end: parse(f.end) }] })), breaks: [] });
      if (!p.success) throw new Error(p.error.issues[0]!.message);
      return api.post(biz.api("/staff"), p.data);
    },
    onSuccess: () => { toast.success("Staff added"); setF({ ...f, name: "" }); qc.invalidateQueries({ queryKey: ["biz"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card><CardHeader title="Your team" description="Add staff now (Mon–Sat schedule); fine-tune breaks, leave and logins later under Staff." /><CardBody className="space-y-4">
      {data.length > 0 && <ul className="flex flex-wrap gap-2">{data.map((s) => <li key={s.id}><Badge tone="brand">{s.name} · {s.title}</Badge></li>)}</ul>}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px_110px_auto] sm:items-end">
        <Field label="Name">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Arun" />}</Field>
        <Field label="Role">{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <Field label="From">{(p) => <Input {...p} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />}</Field>
        <Field label="To">{(p) => <Input {...p} type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />}</Field>
        <Button onClick={() => m.mutate()} loading={m.isPending} disabled={f.name.trim().length < 2}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <Button onClick={onNext} disabled={!data.length}>Continue <ArrowRight className="h-4 w-4" /></Button>
    </CardBody></Card>
  );
}

function ServicesStep({ onNext }: { onNext: () => void }) {
  const biz = useBiz();
  const { data = [] } = useQuery({ queryKey: ["biz", "services", biz.salonId], queryFn: () => api.get<ServiceRow[]>(biz.api("/services")) });
  const [open, setOpen] = useState(false);
  return (
    <Card><CardHeader title="Your service menu" description="Price, duration, cleanup buffer, required resource and which staff can do it." action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add service</Button>} /><CardBody className="space-y-4">
      {data.length ? <ul className="divide-y divide-line rounded-xl border border-line">{data.map((s) => <li key={s.id} className="flex justify-between px-3 py-2 text-sm"><span className="font-semibold">{s.name}</span><span>{formatINR(s.price)} · {s.durationMinutes} min</span></li>)}</ul> : <p className="text-sm text-muted">No services yet.</p>}
      <Button onClick={onNext} disabled={!data.length}>Continue <ArrowRight className="h-4 w-4" /></Button>
      {open && <ServiceDialog service={null} onClose={() => setOpen(false)} />}
    </CardBody></Card>
  );
}

function VerifyStep({ salon }: { salon: NonNullable<SalonLite> }) {
  const router = useRouter();
  const m = useMutation({ mutationFn: () => api.post(`/api/business/salons/${salon.id}/submit`), onSuccess: () => { toast.success("Submitted for verification!"); router.refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const submitted = !["DRAFT", "REJECTED"].includes(salon.status);
  return (
    <Card><CardBody className="space-y-4 p-6">
      {salon.status === "APPROVED" ? (
        <div className="text-center"><PartyPopper className="mx-auto h-10 w-10 text-success" /><p className="mt-3 text-xl font-bold">Your salon is live!</p><ButtonLink href="/business" className="mt-4">Open dashboard</ButtonLink></div>
      ) : submitted ? (
        <div className="text-center"><ShieldCheck className="mx-auto h-10 w-10 text-info" /><p className="mt-3 text-xl font-bold">Verification in progress</p><p className="mt-1 text-sm text-muted">Status: {salon.status.replace("_", " ").toLowerCase()}. We usually review within 48 hours. You&apos;ll get a notification.</p><ButtonLink href="/business" variant="secondary" className="mt-4">Go to dashboard</ButtonLink></div>
      ) : (
        <>
          {salon.status === "REJECTED" && salon.verificationNotes && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">Reviewer notes: {salon.verificationNotes}</p>}
          <p className="text-ink-2">We&apos;ll check that your salon has a location, hours, at least one seat, staff member and service, and payout details. Once approved, you&apos;ll appear in search and can accept online bookings.</p>
          <ul className="space-y-2 text-sm">{["Profile & location", "Business hours", "Seats/resources", "Staff", "Services", "Payout details", "Policies"].map((x) => <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {x}</li>)}</ul>
          <Button size="lg" onClick={() => m.mutate()} loading={m.isPending}><ShieldCheck className="h-4 w-4" /> Submit for verification</Button>
        </>
      )}
    </CardBody></Card>
  );
}
