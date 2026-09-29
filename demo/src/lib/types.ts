export const PHYSICIANS = [
  "Amara Okonkwo",
  "Elias Chen",
  "Priya Nair",
  "Jonah Hale",
] as const

export type Physician = (typeof PHYSICIANS)[number]

export const GENDERS = ["Female", "Male", "Other"] as const
export type Gender = (typeof GENDERS)[number]

export const APPOINTMENT_STATUSES = ["pending", "scheduled", "cancelled"] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export const SUPPLY_CATEGORIES = [
  "Implant",
  "Consumable",
  "Medication",
  "Suture",
  "PPE",
] as const
export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number]

export const SURGERY_STATUSES = ["planned", "in-progress", "completed"] as const
export type SurgeryStatus = (typeof SURGERY_STATUSES)[number]

export const LABOR_ROLES = [
  "Lead surgeon",
  "Assistant surgeon",
  "Anesthesiologist",
  "Scrub nurse",
  "Circulating nurse",
] as const
export type LaborRole = (typeof LABOR_ROLES)[number]

export const ROLE_RATES: Record<LaborRole, number> = {
  "Lead surgeon": 850,
  "Assistant surgeon": 420,
  Anesthesiologist: 480,
  "Scrub nurse": 95,
  "Circulating nurse": 85,
}

export type Patient = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  birthDate: string
  gender: Gender
  address: string
  emergencyContactName: string
  emergencyContactNumber: string
  primaryPhysician: string
  insuranceProvider: string
  insurancePolicyNumber: string
  allergies: string
  currentMedication: string
  pastMedicalHistory: string
  treatmentConsent: boolean
  privacyConsent: boolean
}

export type Appointment = {
  id: string
  patientId: string
  physician: string
  schedule: string
  reason: string
  note: string
  status: AppointmentStatus
  cancellationReason: string
}

export type Supply = {
  id: string
  name: string
  category: SupplyCategory
  sku: string
  quantity: number
  unit: string
  reorderLevel: number
  unitCost: number
  controlled?: boolean
  lotExpiry?: string
  lastReconciledAt?: string
}

export const VARIANCE_REASONS = [
  "miscount",
  "wastage",
  "expiry",
  "shrinkage",
  "found",
  "unrecorded-use",
] as const
export type VarianceReason = (typeof VARIANCE_REASONS)[number]

export type ReconciliationEntry = {
  supplyId: string
  expected: number
  counted: number | null
  reason?: VarianceReason
  note?: string
  witness?: string
  resolved: boolean
}

export type ReconciliationSession = {
  id: string
  date: string
  performedBy: string
  status: "open" | "signed"
  entries: ReconciliationEntry[]
  signedAt?: string
  signedBy?: string
}

export type MaterialLine = {
  id: string
  supplyId?: string
  name: string
  quantity: number
  unitCost: number
  deducted?: boolean
}

export type LaborLine = {
  id: string
  role: LaborRole
  staffName: string
  hours: number
  hourlyRate: number
}

export type ChargeLine = {
  id: string
  label: string
  amount: number
}

export type SurgeryCase = {
  id: string
  patientId: string
  procedure: string
  leadSurgeon: string
  date: string
  status: SurgeryStatus
  orRoom: string
  materials: MaterialLine[]
  labor: LaborLine[]
  charges: ChargeLine[]
}

// One approved device line from a scanned compliance form. Written only after a
// human approves the extraction in the intake review UI.
export type UsageLogEntry = {
  id: string
  formId: string | null
  procedureDate: string | null
  centerHint: string | null
  supplyId: string
  sku: string
  device: string
  qty: number
  approvedBy: string
  rawStickerText: string
  recordedAt: string
}

export type AppState = {
  patients: Patient[]
  appointments: Appointment[]
  supplies: Supply[]
  surgeries: SurgeryCase[]
  reconciliations: ReconciliationSession[]
  usageLog: UsageLogEntry[]
}

export function patientName(patient: Pick<Patient, "firstName" | "lastName">) {
  return `${patient.firstName} ${patient.lastName}`
}
