"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { loginSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

const DEMO = [
  ["Customer", "customer@example.com"],
  ["Salon owner", "owner@example.com"],
  ["Staff", "staff@example.com"],
  ["Admin", "admin@example.com"],
] as const;

export function LoginForm({ showDemo }: { showDemo: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    const input = creds ?? { email, password };
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const res = await api.post<{ redirect: string }>(`/api/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, parsed.data);
      router.push(res.redirect);
      router.refresh();
    } catch (err) {
      setFormError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-muted">Sign in to manage your bookings.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {formError && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{formError}</p>}
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => (
            <div className="relative">
              <Input {...p} type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-11" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </Field>
        <Button type="submit" size="lg" block loading={loading}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to BookMyStyle? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand hover:underline">Create an account</Link>
      </p>
      {showDemo && (
        <div className="mt-8 rounded-2xl border border-dashed border-line-strong p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Demo accounts (development only)</p>
          <p className="mt-1 text-xs text-muted">Password for all: <code className="font-mono font-bold text-ink">Password@123</code></p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO.map(([label, em]) => (
              <button key={em} type="button" disabled={loading} onClick={() => submit(undefined, { email: em, password: "Password@123" })} className="rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm hover:border-brand">
                <span className="block font-semibold">{label}</span>
                <span className="block truncate text-xs text-muted">{em}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
