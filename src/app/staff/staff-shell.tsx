"use client";
import { ClipboardList, Home, LayoutGrid, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";
import { useBiz } from "@/components/business/business-context";
import { Logo } from "@/components/ui/logo";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";

export function StaffShell({ user, staffName, title, children }: { user: SessionUser; staffName: string; title: string; children: ReactNode }) {
  const path = usePathname();
  const biz = useBiz();
  const nav = [
    { href: "/staff", label: "Today", icon: Home, show: true },
    { href: "/staff/board", label: "Board", icon: LayoutGrid, show: true },
    { href: "/staff/bookings", label: "Bookings", icon: ClipboardList, show: true },
    { href: "/staff/walk-in", label: "Walk-in", icon: UserPlus, show: biz.can("WALK_IN") },
  ].filter((n) => n.show);
  const active = (h: string) => (h === "/staff" ? path === h : path.startsWith(h));
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo compact />
          <div className="min-w-0"><p className="truncate text-sm font-bold">{biz.salonName}</p><p className="truncate text-xs text-muted">{staffName} · {title}</p></div>
          <nav className="ml-6 hidden gap-1 md:flex">{nav.map((n) => <Link key={n.href} href={n.href} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", active(n.href) ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2")}>{n.label}</Link>)}</nav>
          <div className="ml-auto flex items-center gap-1"><NotificationBell userId={user.id} /><UserMenu user={user} /></div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        {nav.map((n) => <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active(n.href) ? "text-brand" : "text-muted")}><n.icon className="h-5 w-5" />{n.label}</Link>)}
      </nav>
    </div>
  );
}
