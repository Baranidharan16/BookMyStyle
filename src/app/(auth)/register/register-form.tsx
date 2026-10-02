"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Store, User } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { registerSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function RegisterForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [role, setRole] = useState<"CUSTOMER" | "OWNER">(sp.get("role") === "OWNER" ? "OWNER" : "CUSTOMER");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = registerSchema.safeParse({ ...form, role });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const res = await api.post<{ redirect: string }>("/api/auth/register", parsed.data);
      const next = sp.get("next");
      router.push(role === "CUSTOMER" && next?.startsWith("/") ? next : res.redirect);
      router.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-muted">Takes less than a minute.</p>
      <div role="radiogroup" aria-label="Account type" className="mt-6 grid grid-cols-2 gap-2">
        {([["CUSTOMER", "I want to book", User], ["OWNER", "I own a salon", Store]] as const).map(([v, label, Icon]) => (
          <button key={v} type="button" role="radio" aria-checked={role === v} onClick={() => setRole(v)} className={cn("flex items-center gap-2 rounded-2xl border p-3 text-left text-sm font-semibold transition", role === v ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2")}>
            <Icon className="h-5 w-5" /> {label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {formError && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{formError}</p>}
        <Field label="Full name" error={errors.name}>{(p) => <Input {...p} autoComplete="name" value={form.name} onChange={set("name")} />}</Field>
        <Field label="Email" error={errors.email}>{(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={set("email")} />}</Field>
        <Field label="Mobile number" error={errors.phone} hint="We'll send booking updates here.">
          {(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={form.phone} onChange={set("phone")} />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters with a letter and a number.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />}
        </Field>
        <Button type="submit" size="lg" block loading={loading}>{role === "OWNER" ? "Continue to salon setup" : "Create account"}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link></p>
    </div>
  );
}
