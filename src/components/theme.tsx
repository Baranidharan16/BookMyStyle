"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Pref = "light" | "dark" | "system";
const Ctx = createContext<{ pref: Pref; resolved: "light" | "dark"; setPref: (p: Pref) => void }>({ pref: "system", resolved: "light", setPref: () => {} });

/** Inline script that applies the theme before first paint (no flash). */
export const themeScript = `(function(){try{var p=localStorage.getItem('bms-theme')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<Pref>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const apply = useCallback((p: Pref) => {
    const dark = p === "dark" || (p === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    setResolved(dark ? "dark" : "light");
  }, []);

  useEffect(() => {
    const stored = (localStorage.getItem("bms-theme") as Pref) || "system";
    setPrefState(stored);
    apply(stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => (localStorage.getItem("bms-theme") ?? "system") === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [apply]);

  const setPref = (p: Pref) => {
    localStorage.setItem("bms-theme", p);
    setPrefState(p);
    apply(p);
  };
  return <Ctx.Provider value={{ pref, resolved, setPref }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  const opts: { v: Pref; icon: typeof Sun; label: string }[] = [
    { v: "light", icon: Sun, label: "Light theme" },
    { v: "dark", icon: Moon, label: "Dark theme" },
    { v: "system", icon: Monitor, label: "System theme" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-xl border border-line bg-surface-2 p-0.5", className)}>
      {opts.map(({ v, icon: Icon, label }) => (
        <button key={v} type="button" role="radio" aria-checked={pref === v} aria-label={label} onClick={() => setPref(v)} className={cn("rounded-lg p-1.5 transition", pref === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
