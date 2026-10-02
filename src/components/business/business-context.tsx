"use client";
import { createContext, useContext, type ReactNode } from "react";

export type BizCtx = {
  salonId: string;
  salonName: string;
  timezone: string;
  status: string;
  level: "OWNER" | "STAFF" | "ADMIN";
  staffId: string | null;
  permissions: string[];
  userId: string;
  basePath: "/business" | "/staff";
};

const Ctx = createContext<BizCtx | null>(null);

export function BusinessProvider({ value, children }: { value: BizCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBiz() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBiz outside BusinessProvider");
  return { ...c, can: (p: string) => c.level !== "STAFF" || c.permissions.includes(p), api: (path: string) => `/api/business/salons/${c.salonId}${path}` };
}
