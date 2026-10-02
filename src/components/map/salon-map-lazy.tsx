"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "../ui/states";

export const SalonMapLazy = dynamic(() => import("./salon-map"), { ssr: false, loading: () => <Skeleton className="h-[420px] w-full rounded-2xl" /> });
export type { MapSalon } from "./salon-map";
