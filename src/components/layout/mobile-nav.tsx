"use client";
import { CalendarCheck, Heart, Home, Search, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") || p.startsWith("/salons") },
  { href: "/customer/dashboard", label: "Bookings", icon: CalendarCheck, match: (p: string) => p.startsWith("/customer/dashboard") || p.startsWith("/customer/bookings") },
  { href: "/customer/favorites", label: "Favourites", icon: Heart, match: (p: string) => p.startsWith("/customer/favorites") },
  { href: "/customer/profile", label: "Profile", icon: User, match: (p: string) => p.startsWith("/customer/profile") || p.startsWith("/notifications") },
];

/** App-like bottom tab bar for customers on mobile. */
export function MobileNav() {
  const path = usePathname();
  if (path.startsWith("/checkout") || /^\/salons\/[^/]+\/[^/]+\/book/.test(path)) return null;
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-brand" : "text-muted")}>
                <Icon className={cn("h-5 w-5", active && "fill-brand/15")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
