import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { SalonCover } from "@/components/customer/salon-cover";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" aria-label="BookMyStyle home"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
      <div className="relative hidden overflow-hidden lg:block">
        <SalonCover seed="bookmystyle-auth" color="#a3214f" variant={3} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-0 p-12 text-white">
          <p className="font-display text-4xl font-semibold leading-tight">“Booked a fade at 5:30, walked in at 5:28, sat down at 5:30.”</p>
          <p className="mt-4 text-white/80">Real-time availability for salons, spas and barbers.</p>
        </div>
      </div>
    </div>
  );
}
