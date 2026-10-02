import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Link href="/" className="inline-block"><Logo /></Link>
        <p className="mt-10 font-display text-7xl font-semibold text-brand">404</p>
        <h1 className="mt-2 text-2xl font-bold">This page took the day off</h1>
        <p className="mt-2 text-muted">The link may be broken or the page may have moved.</p>
        <div className="mt-6 flex justify-center gap-2"><ButtonLink href="/">Go home</ButtonLink><ButtonLink href="/search" variant="secondary">Find a salon</ButtonLink></div>
      </div>
    </main>
  );
}
