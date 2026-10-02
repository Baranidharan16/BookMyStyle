"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Clock, LogIn, Play, UserX, XCircle, Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input, Select, Textarea } from "../ui/form";
import { useBiz } from "./business-context";

export type ActionBooking = { id: string; status: string; paymentStatus: string; startsAt: string | Date; source?: string; customerName: string };

/** Context-aware status actions for a booking (respects staff permissions). */
export function BookingActions({ b, size = "sm", onDone }: { b: ActionBooking; size?: "sm" | "md"; onDone?: () => void }) {
  const qc = useQueryClient();
  const biz = useBiz();
  const [waitOpen, setWaitOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["biz"] });
    qc.invalidateQueries({ queryKey: ["booking", b.id] });
    onDone?.();
  };
  const t = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ status: string; message: string | null }>(biz.api(`/bookings/${b.id}/transition`), body),
    onSuccess: (r) => {
      if (r.message) toast.warning(r.message, { duration: 8000 });
      else toast.success(`Updated — ${r.status.replace("_", " ").toLowerCase()}`);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const s = b.status;
  const graceOver = Date.now() > new Date(b.startsAt).getTime();
  const canCheckIn = biz.can("CHECK_IN");
  const canManage = biz.can("MANAGE_BOOKINGS");
  return (
    <div className="flex flex-wrap gap-1.5">
      {s === "CONFIRMED" && canCheckIn && <Button size={size} onClick={() => t.mutate({ action: "CHECK_IN" })} loading={t.isPending}><LogIn className="h-4 w-4" /> Check in</Button>}
      {s === "CONFIRMED" && b.source && b.source !== "ONLINE" && canCheckIn && <Button size={size} variant="secondary" onClick={() => t.mutate({ action: "START" })}><Play className="h-4 w-4" /> Start</Button>}
      {(s === "CHECKED_IN" || s === "WAITING") && canCheckIn && (
        <>
          <Button size={size} onClick={() => t.mutate({ action: "START" })} loading={t.isPending}><Play className="h-4 w-4" /> Start service</Button>
          <Button size={size} variant="secondary" onClick={() => setWaitOpen(true)}><Clock className="h-4 w-4" /> Wait time</Button>
          <Button size={size} variant="ghost" onClick={() => t.mutate({ action: "READY" })}><Bell className="h-4 w-4" /> Ready</Button>
        </>
      )}
      {s === "IN_SERVICE" && canCheckIn && <Button size={size} variant="success" onClick={() => t.mutate({ action: "COMPLETE" })} loading={t.isPending}><CheckCircle2 className="h-4 w-4" /> Complete</Button>}
      {["CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE", "COMPLETED"].includes(s) && ["PENDING", "INITIATED"].includes(b.paymentStatus) && canManage && (
        <Button size={size} variant="soft" onClick={() => setPayOpen(true)}><Banknote className="h-4 w-4" /> Collect payment</Button>
      )}
      {s === "CONFIRMED" && graceOver && canManage && <Button size={size} variant="dangerSoft" onClick={() => t.mutate({ action: "NO_SHOW" })}><UserX className="h-4 w-4" /> No-show</Button>}
      {["CONFIRMED", "CHECKED_IN", "WAITING"].includes(s) && canManage && <Button size={size} variant="ghost" onClick={() => setCancelOpen(true)}><XCircle className="h-4 w-4" /> Cancel</Button>}

      <WaitDialog open={waitOpen} onClose={() => setWaitOpen(false)} onSubmit={(estimatedStartAt, note) => { t.mutate({ action: "WAIT", estimatedStartAt, note }); setWaitOpen(false); }} />
      <PayDialog open={payOpen} onClose={() => setPayOpen(false)} onSubmit={(paymentMode) => { t.mutate({ action: "COLLECT_PAYMENT", paymentMode }); setPayOpen(false); }} />
      <CancelBySalon open={cancelOpen} onClose={() => setCancelOpen(false)} b={b} onDone={refresh} />
    </div>
  );
}

function WaitDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (iso: string, note?: string) => void }) {
  const [mins, setMins] = useState(15);
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title="Update waiting time" description="The customer sees this live on their booking." footer={<Button onClick={() => onSubmit(new Date(Date.now() + mins * 60_000).toISOString(), note || undefined)}>Notify customer</Button>}>
      <div className="flex flex-wrap gap-2">
        {[5, 10, 15, 20, 30, 45].map((m) => <button key={m} onClick={() => setMins(m)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${mins === m ? "border-brand bg-brand text-white" : "border-line"}`}>{m} min</button>)}
      </div>
      <Input className="mt-3" type="number" min={1} max={240} value={mins} onChange={(e) => setMins(Math.max(1, +e.target.value))} aria-label="Minutes" />
      <Textarea className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note, e.g. ‘Previous service running late’" maxLength={300} aria-label="Note" />
    </Dialog>
  );
}

function PayDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (mode: "CASH" | "UPI" | "CARD" | "OTHER") => void }) {
  const [mode, setMode] = useState<"CASH" | "UPI" | "CARD" | "OTHER">("UPI");
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Record payment" footer={<Button onClick={() => onSubmit(mode)}>Mark as paid</Button>}>
      <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Payment mode">
        <option value="UPI">UPI</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option>
      </Select>
    </Dialog>
  );
}

function CancelBySalon({ open, onClose, b, onDone }: { open: boolean; onClose: () => void; b: ActionBooking; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => api.post<{ refund: { amount: number } }>(`/api/bookings/${b.id}/cancel`, { reason: reason || "Cancelled by salon" }),
    onSuccess: (r) => {
      toast.success("Booking cancelled", { description: r.refund.amount ? `Full refund initiated to the customer.` : undefined });
      onClose();
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} title={`Cancel ${b.customerName}'s booking?`} description="Salon-initiated cancellations are fully refunded and the customer is notified." footer={<Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>Cancel booking</Button>}>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shown to the customer" maxLength={500} aria-label="Reason" />
    </Dialog>
  );
}
