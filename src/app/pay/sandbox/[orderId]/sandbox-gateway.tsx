"use client";
import { CreditCard, FlaskConical, Landmark, Loader2, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { cn, formatINR } from "@/lib/utils";
import { useCountdown } from "@/hooks/use-countdown";

const METHODS = [
  { id: "upi", label: "UPI", icon: Smartphone, hint: "Pay using any UPI app" },
  { id: "card", label: "Card", icon: CreditCard, hint: "Visa, Mastercard, RuPay" },
  { id: "netbanking", label: "Net banking", icon: Landmark, hint: "All major banks" },
  { id: "wallet", label: "Wallet", icon: Wallet, hint: "Paytm, PhonePe, Amazon Pay" },
] as const;

export function SandboxGateway({ orderId, amount, bookingId, code, salonName, lockExpiresAt }: { orderId: string; amount: number; bookingId: string; code: string; salonName: string; lockExpiresAt: string | null }) {
  const router = useRouter();
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("upi");
  const [state, setState] = useState<"idle" | "processing" | "verifying" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const { label } = useCountdown(lockExpiresAt);

  const run = async (outcome: "success" | "failure") => {
    setError(null);
    setState("processing");
    try {
      // 1) "Gateway" processes the payment and returns a signed result to the browser…
      const res = await api.post<{ paymentId: string; signature: string | null; status: string; error: string | null }>("/api/payments/sandbox", { orderId, outcome, method });
      await new Promise((r) => setTimeout(r, 700));
      if (res.status !== "captured" || !res.signature) {
        await api.post("/api/payments/fail", { orderId, reason: res.error ?? "Payment declined." }).catch(() => {});
        setState("failed");
        setError(res.error ?? "Payment declined by the bank.");
        return;
      }
      // 2) …and the merchant server verifies the signature + provider record before confirming.
      setState("verifying");
      await api.post("/api/payments/verify", { orderId, paymentId: res.paymentId, signature: res.signature });
      router.replace(`/customer/bookings/${bookingId}?confirmed=1`);
    } catch (e) {
      setState("failed");
      setError(errorMessage(e));
    }
  };

  return (
    <div className="min-h-dvh bg-[#eef1f6] px-4 py-8 text-[#1f2937] dark:bg-[#0d1117] dark:text-[#e6edf3]">
      <div className="mx-auto max-w-md">
        <div className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">
          <FlaskConical className="h-4 w-4" /> SANDBOX GATEWAY — TEST MODE · no real money moves
        </div>
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#161b22]">
          <div className="bg-[#1e3a8a] px-5 py-4 text-white">
            <p className="text-xs uppercase tracking-wider opacity-75">Paying BookMyStyle</p>
            <p className="mt-1 text-2xl font-bold">{formatINR(amount, { decimals: amount % 100 !== 0 })}</p>
            <p className="text-xs opacity-75">{salonName} · {code} · order {orderId.slice(-8)}</p>
          </div>
          <div className="p-5">
            <p className="mb-3 text-sm font-semibold">Choose a payment method</p>
            <div className="space-y-2">
              {METHODS.map((m) => (
                <button key={m.id} onClick={() => setMethod(m.id)} disabled={state === "processing" || state === "verifying"} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left", method === m.id ? "border-[#1e3a8a] bg-blue-50 dark:bg-blue-950/40" : "border-gray-200 dark:border-gray-700")}>
                  <m.icon className="h-5 w-5 text-[#1e3a8a] dark:text-blue-300" />
                  <span className="flex-1"><span className="block text-sm font-semibold">{m.label}</span><span className="block text-xs text-gray-500">{m.hint}</span></span>
                  <span className={cn("h-4 w-4 rounded-full border-2", method === m.id ? "border-[#1e3a8a] bg-[#1e3a8a]" : "border-gray-300")} />
                </button>
              ))}
            </div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error} You can retry while your slot is held ({label}).</p>}
            <button onClick={() => run("success")} disabled={state === "processing" || state === "verifying"} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1e3a8a] font-bold text-white disabled:opacity-60">
              {state === "processing" || state === "verifying" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {state === "processing" ? "Processing payment…" : state === "verifying" ? "Verifying with merchant…" : `Pay ${formatINR(amount, { decimals: amount % 100 !== 0 })}`}
            </button>
            <button onClick={() => run("failure")} disabled={state === "processing" || state === "verifying"} className="mt-2 h-10 w-full rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950/30">
              Simulate a failed payment
            </button>
            <button onClick={() => router.back()} className="mt-1 h-10 w-full rounded-xl text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel and go back</button>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-gray-500">Slot held for {label}. In production this page is the payment provider&apos;s hosted checkout (e.g. Razorpay).</p>
      </div>
    </div>
  );
}
