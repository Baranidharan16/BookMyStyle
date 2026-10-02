"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main id="main" className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-danger"><AlertTriangle className="h-7 w-7" /></div>
        <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 max-w-md text-muted">We hit an unexpected problem loading this page. Please try again — if it keeps happening, contact support.</p>
        {error.digest && <p className="mt-1 font-mono text-xs text-muted">Ref: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2"><Button onClick={reset}>Try again</Button><ButtonLink href="/" variant="secondary">Go home</ButtonLink></div>
      </div>
    </main>
  );
}
