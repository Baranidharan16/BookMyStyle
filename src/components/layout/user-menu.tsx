"use client";
import { CalendarCheck, Heart, LayoutDashboard, LogOut, Settings, Shield, Store, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { SessionUser } from "@/server/auth/session";
import { Avatar } from "../ui/misc";
import { ThemeToggle } from "../theme";

export function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const links =
    user.role === "CUSTOMER"
      ? [
          { href: "/customer/dashboard", label: "My bookings", icon: CalendarCheck },
          { href: "/customer/favorites", label: "Favourites", icon: Heart },
          { href: "/customer/profile", label: "Profile & settings", icon: User },
        ]
      : user.role === "OWNER"
        ? [{ href: "/business", label: "Business dashboard", icon: Store }, { href: "/business/settings", label: "Salon settings", icon: Settings }]
        : user.role === "STAFF"
          ? [{ href: "/staff", label: "Staff portal", icon: LayoutDashboard }]
          : [{ href: "/admin", label: "Admin console", icon: Shield }];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-surface-2" aria-label="Account menu">
        <Avatar name={user.name} src={user.avatarUrl} size={32} />
        <span className="hidden max-w-[120px] truncate text-sm font-semibold lg:block">{user.name.split(" ")[0]}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 animate-fade-in rounded-2xl border border-line bg-surface p-2 shadow-pop">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-bold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <hr className="my-1 border-line" />
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm text-ink-2">Theme</span>
            <ThemeToggle />
          </div>
          <hr className="my-1 border-line" />
          <button
            role="menuitem"
            onClick={async () => {
              await api.post("/api/auth/logout");
              router.push("/");
              router.refresh();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-danger hover:bg-danger-soft"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
