import { Badge, type Tone } from "../ui/badge";

export const BOOKING_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  PAYMENT_PENDING: { label: "Payment pending", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CHECKED_IN: { label: "Checked in", tone: "info" },
  WAITING: { label: "Waiting", tone: "warning" },
  IN_SERVICE: { label: "In service", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  NO_SHOW: { label: "No show", tone: "danger" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  INITIATED: { label: "Not paid", tone: "neutral" },
  PENDING: { label: "Payment due", tone: "warning" },
  SUCCESSFUL: { label: "Paid", tone: "success" },
  FAILED: { label: "Payment failed", tone: "danger" },
  REFUNDED: { label: "Refunded", tone: "info" },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "info" },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const s = BOOKING_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const s = PAYMENT_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
