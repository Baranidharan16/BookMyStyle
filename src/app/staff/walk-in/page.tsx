"use client";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { WalkInForm } from "@/components/business/walk-in-form";
import { useBiz } from "@/components/business/business-context";
import { EmptyState } from "@/components/ui/states";

export default function StaffWalkIn() {
  const biz = useBiz();
  if (!biz.can("WALK_IN")) return <EmptyState title="Not permitted" description="Ask the salon owner to give you walk-in access." />;
  return (<div className="max-w-3xl"><PageHeader title="Add walk-in" /><Card><CardBody><WalkInForm /></CardBody></Card></div>);
}
