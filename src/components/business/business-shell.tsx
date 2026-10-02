"use client";
import { BarChart3, CalendarDays, ClipboardList, LayoutDashboard, LayoutGrid, Menu, MessageSquareQuote, Scissors, Settings, Sofa, Tag, UserPlus, Users, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { Logo } from "../ui/logo";
import { Badge } from "../ui/badge";
import { NotificationBell } from "../layout/notification-bell";
import { UserMenu } from "../layout/user-menu";
import type { SessionUser } from "@/server/auth/session";
import { useBiz } from "./business-context";

const NAV = [
  { href: "/business", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/business/board", label: "Live board", icon: LayoutGrid },
  { href: "/business/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/business/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/business/walk-in", label: "Add walk-in", icon: UserPlus },
  { sep: "Manage" },
  { href: "/business/resources", label: "Seats & resources", icon: Sofa },
  { href: "/business/staff", label: "Staff", icon: Users },
  { href: "/business/services", label: "Services", icon: Scissors },
  { href: "/business/offers", label: "Offers", icon: Tag },
  { sep: "Grow" },
  { href: "/business/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/business/customers", label: "Customers", icon: UsersRound },
  { href: "/business/reviews", label: "Reviews", icon: MessageSquareQuote },
  { href: "/business/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE = [
  { href: "/business", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/business/board", label: "Board", icon: LayoutGrid },
  { href: "/business/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/business/calendar", label: "Calendar", icon: CalendarDays },
];

export function BusinessShell({ user, salons, children }: { user: SessionUser; salons: { id: string; name: string; status: string }[]; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { salonId, salonName, status } = useBiz();
  const [open, setOpen] = useState(false);
  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path.startsWith(href));

  const Nav = (
    <nav className="space-y-0.5" aria-label="Business">
      {NAV.map((n, i) =>
        "sep" in n ? (
          <p key={i} className="px-3 pb-1 pt-5 text-[11px] font-bold uppercase tracking-wider text-muted">{n.sep}</p>
        ) : (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={isActive(n.href, "exact" in n && n.exact) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition", isActive(n.href, "exact" in n && n.exact) ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            <n.icon className="h-[18px] w-[18px]" /> {n.label}
          </Link>
        ),
      )}
    </nav>
  );

  const Switcher = (
    <div className="rounded-xl border border-line bg-surface-2/60 p-2">
      <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted">Salon</p>
      {salons.length > 1 ? (
        <select
          value={salonId}
          onChange={async (e) => {
            await api.post("/api/business/active-salon", { salonId: e.target.value });
            router.refresh();
          }}
          className="mt-1 w-full rounded-lg bg-transparent px-1 py-1 text-sm font-bold focus:outline-none"
          aria-label="Switch salon"
        >
          {salons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ) : (
        <p className="mt-1 truncate px-1 text-sm font-bold">{salonName}</p>
      )}
      <div className="mt-1 flex items-center justify-between px-1">
        <Badge tone={status === "APPROVED" ? "success" : status === "SUSPENDED" || status === "REJECTED" ? "danger" : "warning"}>{status === "APPROVED" ? "Live" : status.replace("_", " ").toLowerCase()}</Badge>
        <Link href="/business/onboarding/new" className="text-[11px] font-semibold text-brand hover:underline">+ Add salon</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link href="/business" className="px-2"><Logo /></Link>
        {Switcher}
        {Nav}
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-3 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <p className="truncate text-sm font-bold lg:hidden">{salonName}</p>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" className="hidden rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:text-ink sm:block">View marketplace</Link>
            <NotificationBell userId={user.id} />
            <UserMenu user={user} />
          </div>
        </header>
        {status !== "APPROVED" && (
          <div className="border-b border-warning/20 bg-warning-soft px-4 py-2 text-center text-[13px] text-warning sm:px-6">
            {status === "DRAFT" || status === "REJECTED" ? (
              <>Your salon isn&apos;t live yet. <Link href="/business/onboarding" className="font-bold underline">Finish setup & submit for verification</Link></>
            ) : status === "SUSPENDED" ? "Your salon is suspended and hidden from customers. Contact support." : "Your salon is under verification. You can keep setting up — it goes live once approved."}
          </div>
        )}
        <main id="main" className="px-4 py-6 pb-28 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-slide-up flex-col gap-4 overflow-y-auto bg-surface p-4">
            <div className="flex items-center justify-between"><Logo /><button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5"><X className="h-5 w-5" /></button></div>
            {Switcher}
            {Nav}
          </div>
        </div>
      )}

      <nav aria-label="Business quick" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MOBILE.map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", isActive(n.href, n.exact) ? "text-brand" : "text-muted")}>
            <n.icon className="h-5 w-5" /> {n.label}
          </Link>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-muted"><Menu className="h-5 w-5" /> More</button>
      </nav>
    </div>
  );
}
