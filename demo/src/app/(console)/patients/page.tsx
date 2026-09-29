"use client"

import { useMemo, useState } from "react"
import { type AppColumn } from "@/components/console/data-table"

import { DataTable } from "@/components/console/data-table"
import { PageIntro } from "@/components/console/stat-card"
import { PatientDialog } from "@/components/forms/patient-dialog"
import { Input } from "@/components/ui/input"
import { useStore } from "@/lib/store"
import { patientName, type Patient } from "@/lib/types"

export default function PatientsPage() {
  const { patients } = useStore()
  const [query, setQuery] = useState("")
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return patients.filter((patient) => {
      const haystack = `${patientName(patient)} ${patient.primaryPhysician} ${patient.insuranceProvider}`.toLowerCase()
      return needle.length === 0 || haystack.includes(needle)
    })
  }, [patients, query])

  const columns = useMemo<AppColumn<Patient>[]>(
    () => [
      {
        header: "Patient",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{patientName(row.original)}</p>
            <p className="text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "primaryPhysician", header: "Physician" },
      { accessorKey: "insuranceProvider", header: "Insurance" },
      {
        header: "Allergies",
        cell: ({ row }) => row.original.allergies || "None listed",
      },
    ],
    [],
  )

  return (
    <div>
      <PageIntro eyebrow="Registry" title="Patients">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="min-h-11 sm:w-64"
            placeholder="Search name or insurer"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <PatientDialog />
        </div>
      </PageIntro>
      <DataTable columns={columns} data={rows} empty="No patients yet. Add the first one." />
    </div>
  )
}
