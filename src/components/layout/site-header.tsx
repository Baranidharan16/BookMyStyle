import Link from "next/link";
import { Search } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { Logo } from "../ui/logo";
import { ButtonLink } from "../ui/button";
import { LocationPicker } from "./location-picker";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="BookMyStyle home" className="shrink-0">
          <Logo className="hidden sm:inline-flex" />
          <Logo compact className="sm:hidden" />
        </Link>
        <div className="hidden h-6 w-px bg-line sm:block" />
        <LocationPicker />
        <Link href="/search" className="ml-2 hidden h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm text-muted transition hover:border-line-strong md:flex lg:max-w-md">
          <Search className="h-4 w-4" /> Search salons, services or areas
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          <Link href="/offers" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink lg:block">
            Offers
          </Link>
          {(!user || user.role === "OWNER") && (
            <Link href={user ? "/business" : "/for-salon-owners"} className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink lg:block">
              {user ? "Business" : "For salon owners"}
            </Link>
          )}
          <Link href="/search" className="grid h-10 w-10 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 md:hidden" aria-label="Search">
            <Search className="h-5 w-5" />
          </Link>
          {user ? (
            <>
              <NotificationBell userId={user.id} />
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
