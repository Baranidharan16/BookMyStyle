import "server-only";
import { eq } from "drizzle-orm";
import type { Executor } from "./db";
import { db } from "./db";
import { platformSettings } from "./db/schema";

/** Platform-wide, admin-editable settings. Business model is data, not code. */
export type PlatformConfig = {
  gstPercent: number;
  defaultCommissionPercent: number;
  planCommission: Record<"FREE" | "PRO" | "PREMIUM", number>;
  planMonthlyFee: Record<"FREE" | "PRO" | "PREMIUM", number>;
  showUnapprovedSalons: boolean;
  featuredListingFee: number;
  supportEmail: string;
};

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  gstPercent: 18,
  defaultCommissionPercent: 10,
  planCommission: { FREE: 12, PRO: 8, PREMIUM: 5 },
  planMonthlyFee: { FREE: 0, PRO: 99900, PREMIUM: 249900 },
  showUnapprovedSalons: false,
  featuredListingFee: 49900,
  supportEmail: "support@bookmystyle.in",
};

export async function getPlatformConfig(ex: Executor = db): Promise<PlatformConfig> {
  const row = await ex.query.platformSettings.findFirst({ where: eq(platformSettings.key, "config") });
  return { ...DEFAULT_PLATFORM_CONFIG, ...((row?.value as Partial<PlatformConfig>) ?? {}) };
}

export function commissionFor(cfg: PlatformConfig, salon: { plan: "FREE" | "PRO" | "PREMIUM"; commissionPercent: number | null }) {
  return salon.commissionPercent ?? cfg.planCommission[salon.plan] ?? cfg.defaultCommissionPercent;
}
