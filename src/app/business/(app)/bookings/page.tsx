import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingsView } from "@/components/business/bookings-view";

export const metadata: Metadata = { title: "Bookings" };

export default function Page() {
  return <Suspense><BookingsView /></Suspense>;
}
