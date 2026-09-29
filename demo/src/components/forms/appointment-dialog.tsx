"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Choice, Field } from "@/components/forms/patient-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { newId } from "@/lib/id"
import { useStore } from "@/lib/store"
import { PHYSICIANS, patientName } from "@/lib/types"

export function AppointmentDialog({
  startDate,
  defaultOpen = false,
  onClose,
}: {
  startDate?: string
  defaultOpen?: boolean
  onClose?: () => void
}) {
  const { patients, dispatch } = useStore()
  const [open, setOpen] = useState(defaultOpen)
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "")
  const [physician, setPhysician] = useState<string>(PHYSICIANS[0])
  const [schedule, setSchedule] = useState(startDate ? `${startDate}T09:00` : "")
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")

  function save() {
    if (!patientId || !schedule || reason.trim().length < 2) {
      toast.error("Choose a patient, time, and reason")
      return
    }
    dispatch({
      type: "add-appointment",
      appointment: {
        id: newId("apt"),
        patientId,
        physician,
        schedule,
        reason: reason.trim(),
        note: note.trim(),
        status: "pending",
        cancellationReason: "",
      },
    })
    toast("Appointment requested")
    setReason("")
    setNote("")
    setSchedule("")
    setOpen(false)
    onClose?.()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onClose?.()
      }}
    >
      {defaultOpen ? null : (
        <DialogTrigger render={<Button className="min-h-11" />}>Book appointment</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Book an appointment</DialogTitle>
          <DialogDescription>
            New visits start as pending until you schedule them.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Choice
            label="Patient"
            value={patientId}
            options={patients.map((patient) => ({
              value: patient.id,
              label: patientName(patient),
            }))}
            onChange={setPatientId}
          />
          <Choice
            label="Physician"
            value={physician}
            options={PHYSICIANS}
            onChange={setPhysician}
          />
          <Field label="When">
            <Input
              className="min-h-11"
              type="datetime-local"
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
            />
          </Field>
          <Field label="Reason">
            <Input className="min-h-11" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Field label="Note">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button className="min-h-11" onClick={save}>
            Save appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
