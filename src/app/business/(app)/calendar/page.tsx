import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/card";
import { CalendarView } from "@/components/business/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" description="Drag a booking to another time or seat — every move is re-validated against staff, seats, hours and other bookings." />
      <CalendarView />
    </>
  );
}
