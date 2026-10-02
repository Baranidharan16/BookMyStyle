"use client";
import { useState } from "react";
import { PageHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { AuditSection, HoursSection, LocationSection, PayoutSection, PoliciesSection, ProfileSection } from "@/components/business/settings-sections";

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "location", label: "Location" },
  { value: "hours", label: "Hours & holidays" },
  { value: "policies", label: "Policies" },
  { value: "payouts", label: "Payouts" },
  { value: "audit", label: "Audit log" },
] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("profile");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" />
      <div className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4"><Segmented value={tab} onChange={setTab} options={[...TABS]} /></div>
      {tab === "profile" && <ProfileSection />}
      {tab === "location" && <LocationSection />}
      {tab === "hours" && <HoursSection />}
      {tab === "policies" && <PoliciesSection />}
      {tab === "payouts" && <PayoutSection />}
      {tab === "audit" && <AuditSection />}
    </div>
  );
}
