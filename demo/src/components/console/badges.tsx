import { Badge } from "@/components/ui/badge"
import type { AppointmentStatus, SurgeryStatus } from "@/lib/types"

const appointmentCopy: Record<
  AppointmentStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  scheduled: { label: "Scheduled", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
}

const surgeryCopy: Record<
  SurgeryStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  planned: { label: "Planned", variant: "secondary" },
  "in-progress": { label: "In progress", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
}

export function AppointmentBadge({ status }: { status: AppointmentStatus }) {
  const copy = appointmentCopy[status]
  return <Badge variant={copy.variant}>{copy.label}</Badge>
}

export function SurgeryBadge({ status }: { status: SurgeryStatus }) {
  const copy = surgeryCopy[status]
  return <Badge variant={copy.variant}>{copy.label}</Badge>
}

export function StockBadge({ low }: { low: boolean }) {
  return low ? (
    <Badge className="bg-amber-100 text-amber-950">Reorder</Badge>
  ) : (
    <Badge variant="outline">In stock</Badge>
  )
}

export function ControlledBadge() {
  return <Badge className="bg-rose-100 text-rose-950">Controlled</Badge>
}

export function ExpiryBadge({ expired }: { expired: boolean }) {
  return expired ? (
    <Badge className="bg-rose-100 text-rose-950">Expired</Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-950">Expiring</Badge>
  )
}
