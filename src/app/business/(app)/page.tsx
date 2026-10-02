import type { Metadata } from "next";
import { BusinessDashboard } from "./dashboard-view";

export const metadata: Metadata = { title: "Business dashboard" };

export default function Page() {
  return <BusinessDashboard />;
}
