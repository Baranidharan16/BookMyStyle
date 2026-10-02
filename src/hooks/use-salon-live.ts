"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useBiz } from "@/components/business/business-context";
import { useRealtime } from "./use-realtime";

/** Invalidate all salon-ops queries whenever bookings/resources change in this salon. */
export function useSalonLive() {
  const { salonId } = useBiz();
  const qc = useQueryClient();
  return useRealtime([`ops:${salonId}`, `salon:${salonId}`], () => qc.invalidateQueries({ queryKey: ["biz"] }));
}
