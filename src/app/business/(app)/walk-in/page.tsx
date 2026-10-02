"use client";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { WalkInForm } from "@/components/business/walk-in-form";

export default function WalkInPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add walk-in customer" description="Walk-ins use the same live availability as online bookings — the seat is removed from online slots the moment you save." />
      <Card><CardBody><WalkInForm /></CardBody></Card>
    </div>
  );
}
