"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { newId } from "@/lib/id"
import { useStore } from "@/lib/store"
import { GENDERS, PHYSICIANS } from "@/lib/types"

const schema = z.object({
  firstName: z.string().min(2, "Enter a first name"),
  lastName: z.string().min(2, "Enter a last name"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(7, "Enter a phone number"),
  birthDate: z.string().min(1, "Choose a birth date"),
  gender: z.enum(GENDERS),
  address: z.string().min(5, "Enter an address"),
  emergencyContactName: z.string().min(2, "Enter an emergency contact"),
  emergencyContactNumber: z.string().min(7, "Enter a contact number"),
  primaryPhysician: z.string().min(2, "Choose a physician"),
  insuranceProvider: z.string().min(2, "Enter an insurer"),
  insurancePolicyNumber: z.string().min(2, "Enter a policy number"),
  allergies: z.string(),
  currentMedication: z.string(),
  pastMedicalHistory: z.string(),
  treatmentConsent: z.boolean().refine((value) => value, "Treatment consent is required"),
  privacyConsent: z.boolean().refine((value) => value, "Privacy consent is required"),
})

type Values = z.infer<typeof schema>

const defaults: Values = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  birthDate: "",
  gender: "Female",
  address: "",
  emergencyContactName: "",
  emergencyContactNumber: "",
  primaryPhysician: PHYSICIANS[0],
  insuranceProvider: "",
  insurancePolicyNumber: "",
  allergies: "",
  currentMedication: "",
  pastMedicalHistory: "",
  treatmentConsent: false,
  privacyConsent: false,
}

export function PatientDialog() {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  function onSubmit(values: Values) {
    dispatch({
      type: "add-patient",
      patient: { ...values, id: newId("pat") },
    })
    toast("Patient added")
    form.reset(defaults)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="min-h-11" />}>
        Add patient
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Register a patient</DialogTitle>
          <DialogDescription>
            Demographics, insurance, and consent. Medical history can stay short.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" error={form.formState.errors.firstName?.message}>
              <Input className="min-h-11" {...form.register("firstName")} />
            </Field>
            <Field label="Last name" error={form.formState.errors.lastName?.message}>
              <Input className="min-h-11" {...form.register("lastName")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input className="min-h-11" type="email" {...form.register("email")} />
            </Field>
            <Field label="Phone" error={form.formState.errors.phone?.message}>
              <Input className="min-h-11" {...form.register("phone")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Birth date" error={form.formState.errors.birthDate?.message}>
              <Input className="min-h-11" type="date" {...form.register("birthDate")} />
            </Field>
            <Choice
              label="Gender"
              value={form.watch("gender")}
              options={GENDERS}
              onChange={(value) => form.setValue("gender", value as Values["gender"])}
            />
          </div>
          <Field label="Address" error={form.formState.errors.address?.message}>
            <Input className="min-h-11" {...form.register("address")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Emergency contact" error={form.formState.errors.emergencyContactName?.message}>
              <Input className="min-h-11" {...form.register("emergencyContactName")} />
            </Field>
            <Field label="Emergency phone" error={form.formState.errors.emergencyContactNumber?.message}>
              <Input className="min-h-11" {...form.register("emergencyContactNumber")} />
            </Field>
          </div>
          <Choice
            label="Primary physician"
            value={form.watch("primaryPhysician")}
            options={PHYSICIANS}
            onChange={(value) => form.setValue("primaryPhysician", value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Insurer" error={form.formState.errors.insuranceProvider?.message}>
              <Input className="min-h-11" {...form.register("insuranceProvider")} />
            </Field>
            <Field label="Policy number" error={form.formState.errors.insurancePolicyNumber?.message}>
              <Input className="min-h-11" {...form.register("insurancePolicyNumber")} />
            </Field>
          </div>
          <Field label="Allergies">
            <Input className="min-h-11" {...form.register("allergies")} />
          </Field>
          <Field label="Current medication">
            <Input className="min-h-11" {...form.register("currentMedication")} />
          </Field>
          <Field label="Past history">
            <Textarea {...form.register("pastMedicalHistory")} />
          </Field>
          <Controller
            control={form.control}
            name="treatmentConsent"
            render={({ field }) => (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                Consent to treatment
              </label>
            )}
          />
          <Controller
            control={form.control}
            name="privacyConsent"
            render={({ field }) => (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                Consent to privacy notice
              </label>
            )}
          />
          {form.formState.errors.treatmentConsent ? (
            <p className="text-sm text-destructive">{form.formState.errors.treatmentConsent.message}</p>
          ) : null}
          <DialogFooter>
            <Button type="submit" className="min-h-11">
              Save patient
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly (string | { value: string; label: string })[]
  onChange: (value: string) => void
}) {
  const items = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  )
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select
        value={value}
        items={Object.fromEntries(items.map((option) => [option.value, option.label]))}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
      >
        <SelectTrigger className="min-h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
