"use client";
import { useEffect, useState } from "react";

export function useCountdown(target: string | Date | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return { remainingMs: 0, label: "0:00", expired: true };
  const remainingMs = Math.max(0, new Date(target).getTime() - now);
  const s = Math.floor(remainingMs / 1000);
  return { remainingMs, label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, expired: remainingMs <= 0 };
}
