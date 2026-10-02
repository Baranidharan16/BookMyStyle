"use client";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function AdminChart({ data }: { data: { day: string; bookings: number; gmv: number }[] }) {
  return (
    <ResponsiveContainer>
      <ComposedChart data={data.map((d) => ({ ...d, label: d.day.slice(5), rupees: d.gmv / 100 }))}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }} />
        <Bar yAxisId="l" dataKey="bookings" fill="var(--info)" radius={[4, 4, 0, 0]} name="Bookings" />
        <Line yAxisId="r" dataKey="rupees" stroke="var(--brand)" strokeWidth={2} dot={false} name="GMV (₹)" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
