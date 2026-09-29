"use client"

import { useMemo, useState } from "react"
import { type AppColumn } from "@/components/console/data-table"

import { AppointmentBadge } from "@/components/console/badges"
import { DataTable } from "@/components/console/data-table"
import { PageIntro, StatCard } from "@/components/console/stat-card"
import { Reveal } from "@/components/console/reveal"
import { AppointmentCalendar } from "@/components/console/appointment-calendar"
import { AppointmentDialog } from "@/components/forms/appointment-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatWhen } from "@/lib/money"
import { useStore } from "@/lib/store"
import { cancelReasonSchema, firstIssue } from "@/lib/validation"
import { patientName, type Appointment } from "@/lib/types"
import { toast } from "sonner"

export default function AppointmentsPage() {
  const { appointments, patients, dispatch } = useStore()
  const [query, setQuery] = useState("")
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return appointments.filter((appointment) => {
      const patient = patients.find((item) => item.id === appointment.patientId)
      const name = patient ? patientName(patient) : ""
      const haystack = `${name} ${appointment.physician} ${appointment.reason}`.toLowerCase()
      return needle.length === 0 || haystack.includes(needle)
    })
  }, [appointments, patients, query])

  const columns = useMemo<AppColumn<Appointment>[]>(
    () => [
      {
        header: "Patient",
        cell: ({ row }) => {
          const patient = patients.find((item) => item.id === row.original.patientId)
          return patient ? patientName(patient) : "Unknown"
        },
      },
      { accessorKey: "physician", header: "Physician" },
      {
        header: "When",
        cell: ({ row }) => formatWhen(row.original.schedule),
      },
      { accessorKey: "reason", header: "Reason" },
      {
        header: "Status",
        cell: ({ row }) => <AppointmentBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            {row.original.status !== "scheduled" ? (
              <Button
                size="sm"
                className="min-h-11"
                onClick={() => {
                  dispatch({
                    type: "update-appointment",
                    appointment: {
                      ...row.original,
                      status: "scheduled",
                      cancellationReason: "",
                    },
                  })
                  toast("Appointment scheduled")
                }}
              >
                Schedule
              </Button>
            ) : null}
            {row.original.status !== "cancelled" ? (
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setReason("")
                  setCancelId(row.original.id)
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [dispatch, patients],
  )

  return (
    <div>
      <PageIntro eyebrow="Visits" title="Appointments">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="min-h-11 sm:w-64"
            placeholder="Search patient or reason"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <AppointmentDialog />
        </div>
      </PageIntro>
      <Reveal>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Scheduled" value={String(appointments.filter((item) => item.status === "scheduled").length)} tone="spruce" />
          <StatCard label="Pending" value={String(appointments.filter((item) => item.status === "pending").length)} tone="clay" />
          <StatCard label="Cancelled" value={String(appointments.filter((item) => item.status === "cancelled").length)} />
        </div>
      </Reveal>
      <Tabs defaultValue="list">
        <TabsList className="mb-4 h-auto min-h-11">
          <TabsTrigger value="list" className="min-h-11 px-4">List</TabsTrigger>
          <TabsTrigger value="calendar" className="min-h-11 px-4">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <DataTable columns={columns} data={rows} empty="No appointments match that search." />
        </TabsContent>
        <TabsContent value="calendar">
          <AppointmentCalendar />
        </TabsContent>
      </Tabs>
      <Dialog open={cancelId !== null} onOpenChange={(open) => !open && setCancelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this appointment?</DialogTitle>
          </DialogHeader>
          <Input
            className="min-h-11"
            placeholder="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <DialogFooter>
            <Button
              className="min-h-11"
              variant="destructive"
              onClick={() => {
                const current = appointments.find((item) => item.id === cancelId)
                const parsed = cancelReasonSchema.safeParse(reason)
                if (!current || !parsed.success) {
                  toast.error(parsed.success ? "Appointment not found" : firstIssue(parsed.error))
                  return
                }
                dispatch({
                  type: "update-appointment",
                  appointment: {
                    ...current,
                    status: "cancelled",
                    cancellationReason: parsed.data,
                  },
                })
                toast("Appointment cancelled")
                setCancelId(null)
              }}
            >
              Confirm cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
