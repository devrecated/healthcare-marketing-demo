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
import { newId } from "@/lib/id"
import { useStore } from "@/lib/store"
import { PHYSICIANS, SURGERY_STATUSES, patientName, type SurgeryStatus } from "@/lib/types"

export function SurgeryDialog() {
  const { patients, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "")
  const [procedure, setProcedure] = useState("")
  const [leadSurgeon, setLeadSurgeon] = useState<string>(PHYSICIANS[0])
  const [date, setDate] = useState("")
  const [orRoom, setOrRoom] = useState("OR 1")
  const [status, setStatus] = useState<SurgeryStatus>("planned")

  function save() {
    if (!patientId || procedure.trim().length < 3 || !date) {
      toast.error("Patient, procedure, and date are required")
      return
    }
    dispatch({
      type: "add-surgery",
      surgery: {
        id: newId("sx"),
        patientId,
        procedure: procedure.trim(),
        leadSurgeon,
        date,
        status,
        orRoom: orRoom.trim() || "OR 1",
        materials: [],
        labor: [],
        charges: [],
      },
    })
    toast("Surgery case opened")
    setProcedure("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="min-h-11" />}>
        New surgery
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open a surgery case</DialogTitle>
          <DialogDescription>
            Add materials, staff hours, and facility charges on the next screen.
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
          <Field label="Procedure">
            <Input className="min-h-11" value={procedure} onChange={(event) => setProcedure(event.target.value)} />
          </Field>
          <Choice label="Lead surgeon" value={leadSurgeon} options={PHYSICIANS} onChange={setLeadSurgeon} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input className="min-h-11" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label="Room">
              <Input className="min-h-11" value={orRoom} onChange={(event) => setOrRoom(event.target.value)} />
            </Field>
          </div>
          <Choice
            label="Status"
            value={status}
            options={SURGERY_STATUSES}
            onChange={(value) => setStatus(value as SurgeryStatus)}
          />
        </div>
        <DialogFooter>
          <Button className="min-h-11" onClick={save}>
            Create case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
