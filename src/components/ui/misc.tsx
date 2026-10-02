import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 55% 52%), hsl(${(hue + 40) % 360} 55% 38%))` }}
    >
      {initials(name)}
    </span>
  );
}

export function RatingPill({ value, count, className }: { value: number; count?: number; className?: string }) {
  const tone = value >= 4.3 ? "bg-success text-white" : value >= 3.5 ? "bg-[#4d7c0f] text-white" : value > 0 ? "bg-warning text-white" : "bg-surface-3 text-ink-2";
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold", tone)} aria-label={`Rated ${value.toFixed(1)} out of 5`}>
        {value > 0 ? value.toFixed(1) : "New"}
        {value > 0 && <Star className="h-3 w-3 fill-current" aria-hidden />}
      </span>
      {count != null && count > 0 && <span className="text-xs text-muted">({count.toLocaleString("en-IN")})</span>}
    </span>
  );
}

export function Stars({ value, size = 16, onChange, label = "Rating" }: { value: number; size?: number; onChange?: (v: number) => void; label?: string }) {
  return (
    <div className="inline-flex items-center gap-0.5" role={onChange ? "radiogroup" : "img"} aria-label={onChange ? label : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = <Star className={cn(filled ? "fill-accent text-accent" : "text-line-strong")} style={{ width: size, height: size }} aria-hidden />;
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="rounded p-0.5 transition hover:scale-110">
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="border-line" />;
  return (
    <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
