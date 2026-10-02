import { Suspense } from "react";
import { BookingsView } from "@/components/business/bookings-view";

export default function StaffBookings() {
  return <Suspense><BookingsView /></Suspense>;
}
