import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/card";
import { ResourceBoard } from "@/components/business/resource-board";

export const metadata: Metadata = { title: "Live resource board" };

export default function BoardPage() {
  return (
    <>
      <PageHeader title="Live resource board" description="Every seat, bed and room — who's in, who's next, what's free. Updates in real time." />
      <ResourceBoard />
    </>
  );
}
