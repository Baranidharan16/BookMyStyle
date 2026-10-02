"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker (offline shell only) and offers an install prompt. */
export function PwaRegister() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    try {
      setDismissed(localStorage.getItem("bms-install-dismissed") === "1");
    } catch {}
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred || dismissed) return null;
  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-pop md:bottom-6">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
        <Download className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Install BookMyStyle</p>
        <p className="text-xs text-muted">Faster booking, right from your home screen.</p>
      </div>
      <button
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
        onClick={async () => {
          await deferred.prompt();
          setDeferred(null);
        }}
      >
        Install
      </button>
      <button
        aria-label="Dismiss"
        className="rounded-lg p-1 text-muted hover:bg-surface-2"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem("bms-install-dismissed", "1");
          } catch {}
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
