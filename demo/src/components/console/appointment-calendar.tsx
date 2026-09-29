"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import { AppointmentBadge } from "@/components/console/badges"
import { AppointmentDialog } from "@/components/forms/appointment-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { monthLabel, monthMatrix, todayIso } from "@/lib/calendar"
import { formatWhen } from "@/lib/money"
import { useStore } from "@/lib/store"
import { cancelReasonSchema, firstIssue } from "@/lib/validation"
import { patientName, type Appointment } from "@/lib/types"
import { cn } from "@/lib/utils"

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function AppointmentCalendar() {
  const { appointments, patients, dispatch } = useStore()
  const today = todayIso()
  const [cursor, setCursor] = useState(() => {
    const [year, month] = today.split("-").map(Number)
    return { year, month: month - 1 }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [bookDate, setBookDate] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  const weeks = useMemo(
    () => monthMatrix(cursor.year, cursor.month),
    [cursor.month, cursor.year],
  )
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const appointment of appointments) {
      const day = appointment.schedule.slice(0, 10)
      const list = map.get(day) ?? []
      list.push(appointment)
      map.set(day, list)
    }
    return map
  }, [appointments])

  const selectedVisits = selected ? (byDay.get(selected) ?? []) : []

  function shift(delta: number) {
    setCursor((current) => {
      const date = new Date(Date.UTC(current.year, current.month + delta, 1))
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
    })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading text-2xl">{monthLabel(cursor.year, cursor.month)}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => shift(-1)}>Previous</Button>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              const [year, month] = today.split("-").map(Number)
              setCursor({ year, month: month - 1 })
            }}
          >
            Today
          </Button>
          <Button variant="outline" className="min-h-11" onClick={() => shift(1)}>Next</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <div className="grid min-w-[720px] grid-cols-7">
          {weekdays.map((day) => (
            <div key={day} className="border-b px-2 py-2 text-xs text-muted-foreground">{day}</div>
          ))}
          {weeks.flat().map((cell) => {
            const visits = byDay.get(cell.date) ?? []
            return (
              <button
                key={cell.date}
                type="button"
                className={cn(
                  "min-h-28 border-t border-r p-2 text-left",
                  !cell.inMonth && "bg-muted/40 text-muted-foreground",
                  cell.date === today && "ring-2 ring-primary ring-inset",
                )}
                onClick={() => {
                  if (visits.length === 0) setBookDate(cell.date)
                  else setSelected(cell.date)
                }}
              >
                <span className="text-sm font-medium">{Number(cell.date.slice(8))}</span>
                <div className="mt-1 space-y-1">
                  {visits.slice(0, 3).map((visit) => {
                    const patient = patients.find((item) => item.id === visit.patientId)
                    return (
                      <span
                        key={visit.id}
                        className={cn(
                          "block truncate rounded px-1 text-xs",
                          visit.status === "scheduled" && "bg-primary/15 text-primary",
                          visit.status === "pending" && "bg-accent text-accent-foreground",
                          visit.status === "cancelled" && "bg-muted text-muted-foreground line-through",
                        )}
                      >
                        {visit.schedule.slice(11, 16)} {patient ? patient.lastName : "Visit"}
                      </span>
                    )
                  })}
                  {visits.length > 3 ? (
                    <span className="block text-xs text-muted-foreground">+{visits.length - 3} more</span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-4 md:hidden">
        <p className="mb-2 text-sm text-muted-foreground">Tap a day. Empty days open a booking.</p>
      </div>
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? formatWhen(selected) : "Day"}</DialogTitle>
          </DialogHeader>
          <ul className="space-y-3">
            {selectedVisits.map((visit) => {
              const patient = patients.find((item) => item.id === visit.patientId)
              return (
                <li key={visit.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{patient ? patientName(patient) : "Unknown"}</p>
                    <AppointmentBadge status={visit.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatWhen(visit.schedule)} · Dr. {visit.physician} · {visit.reason}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {visit.status !== "scheduled" ? (
                      <Button
                        size="sm"
                        className="min-h-11"
                        onClick={() => {
                          dispatch({
                            type: "update-appointment",
                            appointment: { ...visit, status: "scheduled", cancellationReason: "" },
                          })
                          toast("Appointment scheduled")
                        }}
                      >
                        Schedule
                      </Button>
                    ) : null}
                    {visit.status !== "cancelled" ? (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => setCancelId(visit.id)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                  {cancelId === visit.id ? (
                    <div className="mt-2 flex gap-2">
                      <Input className="min-h-11" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
                      <Button
                        className="min-h-11"
                        variant="destructive"
                        onClick={() => {
                          const parsed = cancelReasonSchema.safeParse(reason)
                          if (!parsed.success) {
                            toast.error(firstIssue(parsed.error))
                            return
                          }
                          dispatch({
                            type: "update-appointment",
                            appointment: { ...visit, status: "cancelled", cancellationReason: parsed.data },
                          })
                          setCancelId(null)
                          setReason("")
                          toast("Appointment cancelled")
                        }}
                      >
                        Confirm
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
      {bookDate ? (
        <AppointmentDialog
          key={bookDate}
          startDate={bookDate}
          defaultOpen
          onClose={() => setBookDate(null)}
        />
      ) : null}
    </div>
  )
}
