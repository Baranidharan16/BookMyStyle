import { cn } from "@/lib/utils";

/** BookMyStyle mark: a monogram "B" tile with a saffron "spark" (the moment you look great). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#8f1d46" />
      <path d="M0 16C0 7.2 7.2 0 16 0h32c8.8 0 16 7.2 16 16v6C44 30 22 18 0 34V16Z" fill="#c2316a" opacity="0.75" />
      <path
        d="M22 16h12.5c6.4 0 10.5 3.3 10.5 8.6 0 3.4-1.8 5.9-4.7 7 3.8 1 6.2 3.9 6.2 7.9 0 6-4.6 9.5-11.6 9.5H22V16Zm7 13.2h4.6c2.6 0 4.1-1.2 4.1-3.3s-1.5-3.2-4.1-3.2H29v6.5Zm0 13.1h5.4c2.9 0 4.6-1.3 4.6-3.6s-1.7-3.6-4.6-3.6H29v7.2Z"
        fill="#fff"
      />
      <circle cx="49" cy="15" r="4" fill="#f0a83a" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {!compact && (
        <span className="font-display text-[1.35rem] font-semibold leading-none tracking-tight text-ink">
          BookMy<span className="text-brand">Style</span>
        </span>
      )}
    </span>
  );
}
