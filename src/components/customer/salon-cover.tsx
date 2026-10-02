import { cn } from "@/lib/utils";

/**
 * Original generative artwork for salons without uploaded photos: a soft
 * gradient field in the salon's brand colour with an abstract, editorial
 * motif (combs, arcs, mirrors). Deterministic per salon + variant.
 */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function SalonCover({ seed, color, variant = 0, className, label, src }: { seed: string; color: string; variant?: number; className?: string; label?: string; src?: string | null }) {
  if (src && !src.startsWith("gen:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={label ?? ""} loading="lazy" className={cn("h-full w-full object-cover", className)} />;
  }
  const h = hash(`${seed}:${variant}`);
  const motif = (h + variant) % 4;
  const rot = (h % 40) - 20;
  const id = `g${h.toString(36)}`;
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn("h-full w-full", className)}>
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(color, 40)} />
          <stop offset="0.55" stopColor={color} />
          <stop offset="1" stopColor={shade(color, -55)} />
        </linearGradient>
        <radialGradient id={`${id}b`} cx="0.8" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${id}a)`} />
      <rect width="400" height="240" fill={`url(#${id}b)`} />
      <g opacity="0.22" stroke="#fff" fill="none" strokeWidth="2" transform={`rotate(${rot} 200 120)`}>
        {motif === 0 && Array.from({ length: 9 }, (_, i) => <circle key={i} cx={300} cy={60} r={30 + i * 26} />)}
        {motif === 1 && (
          <g transform="translate(250 30)">
            <rect x="0" y="0" width="110" height="18" rx="6" fill="#fff" fillOpacity="0.35" stroke="none" />
            {Array.from({ length: 16 }, (_, i) => <line key={i} x1={6 + i * 6.5} y1={18} x2={6 + i * 6.5} y2={95 + (i % 3) * 4} />)}
          </g>
        )}
        {motif === 2 && Array.from({ length: 7 }, (_, i) => <ellipse key={i} cx={90 + i * 45} cy={150} rx={30} ry={70} />)}
        {motif === 3 && Array.from({ length: 12 }, (_, i) => <path key={i} d={`M ${-20 + i * 40} 260 Q ${60 + i * 40} ${40 + (i % 3) * 30} ${140 + i * 40} 260`} />)}
      </g>
      <circle cx={70 + (h % 60)} cy={190} r="70" fill="#000" opacity="0.12" />
    </svg>
  );
}
