import { WifiOff } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export const dynamic = "force-static";

export default function Offline() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Logo />
        <div className="mx-auto mt-10 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-muted"><WifiOff className="h-7 w-7" /></div>
        <h1 className="mt-4 text-2xl font-bold">You&apos;re offline</h1>
        <p className="mt-2 max-w-sm text-muted">Bookings need a live connection so we can confirm your seat in real time. Reconnect and try again.</p>
      </div>
    </main>
  );
}
