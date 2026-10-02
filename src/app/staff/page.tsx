"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, QrCode, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { formatTime, toDateKey } from "@/lib/time";
import { useBiz } from "@/components/business/business-context";
import { useSalonLive } from "@/hooks/use-salon-live";
import { BookingActions } from "@/components/business/booking-actions";
import { BookingDialog } from "@/components/business/booking-dialog";
import { BookingStatusBadge } from "@/components/booking/status";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { EmptyState, LiveDot, Skeleton } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";

type Row = { id: string; code: string; status: string; startsAt: string; endsAt: string; customerName: string; serviceName: string; resourceNames: string | null; paymentStatus: string; source: string; lateMinutes: number | null };

export default function StaffToday() {
  const biz = useBiz();
  const { connected } = useSalonLive();
  const [open, setOpen] = useState<string | null>(null);
  const today = toDateKey(new Date(), biz.timezone);
  const { data, isLoading } = useQuery({ queryKey: ["biz", "my-day", biz.salonId, today], queryFn: () => api.get<{ items: Row[] }>(biz.api(`/bookings?date=${today}&staffId=${biz.staffId}`)) });
  const list = (data?.items ?? []).filter((b) => !["CANCELLED", "FAILED"].includes(b.status));
  const next = list.find((b) => ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_SERVICE"].includes(b.status));
  return (
    <>
      <PageHeader title="My day" description={<span className="inline-flex items-center gap-2">{list.length} appointments assigned to you {connected && <LiveDot />}</span>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {next && (
            <Card className="border-brand/30 bg-brand-soft/40 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-brand">Up next</p>
              <p className="mt-1 text-xl font-bold">{next.customerName}</p>
              <p className="text-sm text-ink-2">{next.serviceName} · {formatTime(next.startsAt, biz.timezone)}–{formatTime(next.endsAt, biz.timezone)} · {next.resourceNames}</p>
              <div className="mt-3"><BookingActions b={next} size="md" /></div>
            </Card>
          )}
          {isLoading ? <Skeleton className="h-64" /> : !list.length ? <EmptyState title="No appointments assigned to you today" description="Walk-ins and new bookings will show up here live." /> : list.map((b) => (
            <Card key={b.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <button onClick={() => setOpen(b.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                <span className="w-16 shrink-0 text-lg font-bold tabular-nums">{formatTime(b.startsAt, biz.timezone)}</span>
                <span className="min-w-0"><span className="block truncate font-semibold">{b.customerName}</span><span className="block truncate text-sm text-muted">{b.serviceName} · {b.resourceNames}</span></span>
              </button>
              <div className="flex flex-wrap items-center gap-2">{b.source !== "ONLINE" && <Badge>Walk-in</Badge>}<BookingStatusBadge status={b.status} /><BookingActions b={b} /></div>
            </Card>
          ))}
        </div>
        {biz.can("CHECK_IN") && <CheckInCard />}
      </div>
      <BookingDialog bookingId={open} onClose={() => setOpen(null)} />
    </>
  );
}

function CheckInCard() {
  const biz = useBiz();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [last, setLast] = useState<{ name: string; message: string | null; status: string } | null>(null);
  const m = useMutation({
    mutationFn: (v: { code: string; token?: string }) => api.post<{ customerName: string; status: string; message: string | null }>(biz.api("/check-in"), v),
    onSuccess: (r) => { setLast({ name: r.customerName, message: r.message, status: r.status }); setCode(""); qc.invalidateQueries({ queryKey: ["biz"] }); toast.success(`${r.customerName} checked in`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } };
    (async () => {
      if (!W.BarcodeDetector) { toast.error("QR scanning isn't supported in this browser. Enter the booking ID instead."); setScanning(false); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const det = new W.BarcodeDetector({ formats: ["qr_code"] });
        const loop = async () => {
          const res = await det.detect(v).catch(() => []);
          if (res[0]) {
            try {
              const p = JSON.parse(res[0].rawValue) as { t: string; c: string; k: string };
              if (p.t === "bms") { m.mutate({ code: p.c, token: p.k }); setScanning(false); return; }
            } catch {}
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        toast.error("Camera permission denied.");
        setScanning(false);
      }
    })();
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [scanning]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="h-fit lg:sticky lg:top-20">
      <CardHeader title="Check in a customer" description="Scan the QR on their ticket or type the booking ID." />
      <CardBody className="space-y-3">
        {scanning ? (
          <div className="relative overflow-hidden rounded-xl bg-black"><video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline /><ScanLine className="absolute inset-0 m-auto h-16 w-16 animate-pulse-soft text-white" /></div>
        ) : (
          <Button variant="soft" block onClick={() => setScanning(true)}><Camera className="h-4 w-4" /> Scan QR code</Button>
        )}
        {scanning && <Button variant="ghost" block onClick={() => setScanning(false)}>Stop scanning</Button>}
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) m.mutate({ code: code.trim() }); }} className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SAL-20261005-4821" className="font-mono" aria-label="Booking ID" />
          <Button type="submit" loading={m.isPending}><QrCode className="h-4 w-4" /></Button>
        </form>
        {last && (
          <div className={`rounded-xl p-3 text-sm ${last.message ? "bg-warning-soft" : "bg-success-soft"}`}>
            <p className="flex items-center gap-1.5 font-bold"><CheckCircle2 className="h-4 w-4" /> {last.name} — {last.status.replace("_", " ").toLowerCase()}</p>
            {last.message && <p className="mt-1 text-ink-2">{last.message}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
