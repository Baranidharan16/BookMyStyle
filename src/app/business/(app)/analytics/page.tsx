"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/utils";
import { formatMinutes, WEEKDAY_SHORT } from "@/lib/time";
import { useBiz } from "@/components/business/business-context";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";

type A = {
  range: { from: string; to: string; days: number };
  totals: { revenue: number; bookings: number; averageOrderValue: number; cancellationRate: number; noShowRate: number; online: number; offline: number; discounts: number; newCustomers: number; returningCustomers: number; retentionRate: number };
  daily: { day: string; revenue: number; bookings: number; online: number; offline: number }[];
  popularServices: { name: string; bookings: number; revenue: number }[];
  peakHours: { hour: number; bookings: number }[];
  weekday: { dow: number; bookings: number }[];
  staffUtilization: { name: string; booked: number; scheduled: number; bookings: number; rating: number; utilization: number }[];
  resourceUtilization: { name: string; type: string; booked: number; utilization: number }[];
  offers: { code: string; title: string; uses: number; discount: number; revenue: number }[];
};
const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 } };
const axis = { tick: { fontSize: 11, fill: "var(--muted)" }, tickLine: false, axisLine: false } as const;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function AnalyticsPage() {
  const biz = useBiz();
  const [days, setDays] = useState("30");
  const { data: a } = useQuery({ queryKey: ["biz", "analytics", biz.salonId, Number(days)], queryFn: () => api.get<A>(biz.api(`/analytics?days=${days}`)) });
  return (
    <>
      <PageHeader title="Analytics" description="Revenue excludes GST. All numbers come from your real bookings." actions={<Segmented value={days} onChange={setDays} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "90", label: "90d" }]} />} />
      {!a ? <div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Revenue" value={formatINR(a.totals.revenue)} tone="success" />
            <Stat label="Bookings" value={a.totals.bookings} tone="brand" />
            <Stat label="Avg. order value" value={formatINR(a.totals.averageOrderValue)} />
            <Stat label="Walk-in vs online" value={`${a.totals.offline} / ${a.totals.online}`} hint={a.totals.bookings ? `${Math.round((a.totals.offline / a.totals.bookings) * 100)}% walk-in` : undefined} />
            <Stat label="New customers" value={a.totals.newCustomers} tone="info" />
            <Stat label="Returning customers" value={a.totals.returningCustomers} hint={`Retention ${pct(Math.min(1, a.totals.retentionRate))}`} />
            <Stat label="Cancellation rate" value={pct(a.totals.cancellationRate)} tone="warning" />
            <Stat label="No-show rate" value={pct(a.totals.noShowRate)} tone="danger" />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card><CardHeader title="Revenue" /><CardBody className="h-72">
              <ResponsiveContainer><LineChart data={a.daily.map((d) => ({ ...d, label: d.day.slice(5), rupees: d.revenue / 100 }))}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} /><Tooltip {...tip} formatter={(v) => formatINR(Number(v) * 100)} /><Line type="monotone" dataKey="rupees" name="Revenue" stroke="var(--brand)" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer>
            </CardBody></Card>
            <Card><CardHeader title="Bookings — online vs walk-in" /><CardBody className="h-72">
              <ResponsiveContainer><BarChart data={a.daily.map((d) => ({ ...d, label: d.day.slice(5) }))}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="online" name="Online" stackId="a" fill="var(--info)" radius={[0, 0, 0, 0]} /><Bar dataKey="offline" name="Walk-in" stackId="a" fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </CardBody></Card>
            <Card><CardHeader title="Peak hours" description="When customers book appointments" /><CardBody className="h-64">
              <ResponsiveContainer><BarChart data={a.peakHours.map((h) => ({ ...h, label: formatMinutes(h.hour * 60).replace(":00", "") }))}><XAxis dataKey="label" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tip} /><Bar dataKey="bookings" fill="var(--brand)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </CardBody></Card>
            <Card><CardHeader title="Busiest days" /><CardBody className="h-64">
              <ResponsiveContainer><BarChart data={a.weekday.map((w) => ({ ...w, label: WEEKDAY_SHORT[w.dow] }))}><XAxis dataKey="label" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tip} /><Bar dataKey="bookings" fill="var(--success)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </CardBody></Card>
            <Card><CardHeader title="Popular services" /><CardBody className="h-72">
              <ResponsiveContainer><PieChart><Pie data={a.popularServices} dataKey="bookings" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>{a.popularServices.map((_, i) => <Cell key={i} fill={["#a3214f", "#e0911b", "#1d5fbf", "#15803d", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"][i % 8]} />)}</Pie><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" align="right" verticalAlign="middle" /></PieChart></ResponsiveContainer>
            </CardBody></Card>
            <Card><CardHeader title="Staff utilisation" description="Booked time ÷ scheduled time (excl. breaks)" /><CardBody className="space-y-3">
              {a.staffUtilization.map((s) => (
                <div key={s.name}>
                  <div className="flex justify-between text-sm"><span className="font-semibold">{s.name}</span><span className="text-muted">{pct(s.utilization)} · {s.bookings} bookings</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-brand" style={{ width: pct(s.utilization) }} /></div>
                </div>
              ))}
            </CardBody></Card>
            <Card><CardHeader title="Resource utilisation" description="Occupied time ÷ open hours" /><CardBody className="grid gap-3 sm:grid-cols-2">
              {a.resourceUtilization.map((r) => (
                <div key={r.name + r.type}>
                  <div className="flex justify-between text-sm"><span className="font-semibold">{r.name}</span><span className="text-muted">{pct(r.utilization)}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-info" style={{ width: pct(r.utilization) }} /></div>
                </div>
              ))}
            </CardBody></Card>
            <Card><CardHeader title="Offer performance" /><CardBody>
              {a.offers.length === 0 ? <p className="text-sm text-muted">No offers yet.</p> : (
                <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted"><tr><th className="pb-2">Code</th><th className="pb-2 text-right">Uses</th><th className="pb-2 text-right">Discount given</th><th className="pb-2 text-right">Revenue</th></tr></thead>
                  <tbody className="divide-y divide-line">{a.offers.map((o) => <tr key={o.code}><td className="py-2 font-mono font-semibold">{o.code}</td><td className="py-2 text-right">{o.uses}</td><td className="py-2 text-right">{formatINR(o.discount)}</td><td className="py-2 text-right">{formatINR(o.revenue)}</td></tr>)}</tbody></table>
              )}
            </CardBody></Card>
          </div>
        </div>
      )}
    </>
  );
}
