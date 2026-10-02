"use client";
import { BarChart3, ClipboardList, CreditCard, FileClock, Gavel, MessageSquareWarning, Settings, Store, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";
import { Logo } from "@/components/ui/logo";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";

const NAV = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/salons", label: "Salons", icon: Store },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/admin/payments", label: "Payments & refunds", icon: CreditCard },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquareWarning },
  { href: "/admin/disputes", label: "Disputes", icon: Gavel },
  { href: "/admin/settings", label: "Platform settings", icon: Settings },
  { href: "/admin/audit", label: "Audit log", icon: FileClock },
];

export function AdminShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const path = usePathname();
  const active = (h: string) => (h === "/admin" ? path === h : path.startsWith(h));
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r border-line bg-surface p-3 lg:flex">
        <div className="px-2"><Logo /><p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted">Admin console</p></div>
        <nav className="space-y-0.5">{NAV.map((n) => <Link key={n.href} href={n.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold", active(n.href) ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2")}><n.icon className="h-4 w-4" />{n.label}</Link>)}</nav>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur">
          <nav className="no-scrollbar flex gap-1 overflow-x-auto lg:hidden">{NAV.map((n) => <Link key={n.href} href={n.href} className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold", active(n.href) ? "bg-brand-soft text-brand" : "text-muted")}>{n.label}</Link>)}</nav>
          <div className="ml-auto flex items-center gap-1"><NotificationBell userId={user.id} /><UserMenu user={user} /></div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
