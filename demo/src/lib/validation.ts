import { z } from "zod"

import { LABOR_ROLES } from "@/lib/types"
import { DATASET_BOUNDS, REGIONS } from "@/lib/insurance-dataset"

export const riskInputSchema = z.object({
  age: z
    .number()
    .int("Age must be a whole number")
    .min(DATASET_BOUNDS.age[0], `Age must be at least ${DATASET_BOUNDS.age[0]}`)
    .max(DATASET_BOUNDS.age[1], `Age must be at most ${DATASET_BOUNDS.age[1]}`),
  sex: z.enum(["female", "male"]),
  bmi: z
    .number()
    .min(DATASET_BOUNDS.bmi[0], `BMI must be at least ${DATASET_BOUNDS.bmi[0]}`)
    .max(DATASET_BOUNDS.bmi[1], `BMI must be at most ${DATASET_BOUNDS.bmi[1]}`),
  children: z
    .number()
    .int("Children must be a whole number")
    .min(DATASET_BOUNDS.children[0])
    .max(DATASET_BOUNDS.children[1]),
  smoker: z.boolean(),
  region: z.enum(REGIONS),
})

export type RiskInputValues = z.infer<typeof riskInputSchema>

export const materialDraftSchema = z.object({
  supplyId: z.string().min(1, "Choose a supply"),
  quantity: z.number().positive("Quantity must be greater than zero"),
  unitCost: z.number().min(0, "Unit cost cannot be negative"),
})

export const laborDraftSchema = z.object({
  role: z.enum(LABOR_ROLES),
  staffName: z.string().trim().min(2, "Enter a name"),
  hours: z.number().positive("Hours must be greater than zero"),
  hourlyRate: z.number().min(0, "Rate cannot be negative"),
})

export const chargeDraftSchema = z.object({
  label: z.string().trim().min(2, "Enter a charge name"),
  amount: z.number().min(0, "Amount cannot be negative"),
})

export const cancelReasonSchema = z.string().trim().min(2, "Add a short reason")

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the form"
}
