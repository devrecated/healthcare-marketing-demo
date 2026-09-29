"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react"

import { seedState, STORAGE_KEY } from "@/lib/seed"
import { newId } from "@/lib/id"
import type {
  Appointment,
  AppState,
  ChargeLine,
  LaborLine,
  MaterialLine,
  Patient,
  ReconciliationEntry,
  ReconciliationSession,
  Supply,
  SurgeryCase,
  UsageLogEntry,
  VarianceReason,
} from "@/lib/types"
import { canSignOff, dayStamp, dueSupplies, entryResolved } from "@/lib/reconciliation"
import { MOCK_USER } from "@/lib/session"

type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "reset" }
  | { type: "add-patient"; patient: Patient }
  | { type: "add-appointment"; appointment: Appointment }
  | { type: "update-appointment"; appointment: Appointment }
  | { type: "add-supply"; supply: Supply }
  | { type: "update-supply"; supply: Supply }
  | { type: "adjust-supply"; id: string; delta: number }
  | { type: "add-surgery"; surgery: SurgeryCase }
  | { type: "patch-surgery"; id: string; patch: Partial<SurgeryCase> }
  | { type: "upsert-material"; surgeryId: string; line: MaterialLine }
  | { type: "remove-material"; surgeryId: string; lineId: string }
  | { type: "upsert-labor"; surgeryId: string; line: LaborLine }
  | { type: "remove-labor"; surgeryId: string; lineId: string }
  | { type: "upsert-charge"; surgeryId: string; line: ChargeLine }
  | { type: "remove-charge"; surgeryId: string; lineId: string }
  | { type: "start-reconciliation" }
  | { type: "set-count"; sessionId: string; supplyId: string; counted: number | null }
  | {
      type: "set-reason"
      sessionId: string
      supplyId: string
      reason?: VarianceReason
      note?: string
      witness?: string
    }
  | { type: "sign-reconciliation"; sessionId: string }
  | { type: "record-device-usage"; entries: UsageLogEntry[] }

function mapSurgery(
  state: AppState,
  id: string,
  update: (surgery: SurgeryCase) => SurgeryCase,
): AppState {
  return {
    ...state,
    surgeries: state.surgeries.map((surgery) =>
      surgery.id === id ? update(surgery) : surgery,
    ),
  }
}

function upsert<T extends { id: string }>(rows: T[], row: T) {
  const index = rows.findIndex((item) => item.id === row.id)
  if (index === -1) return [...rows, row]
  const next = rows.slice()
  next[index] = row
  return next
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.state
    case "reset":
      return seedState()
    case "add-patient":
      return { ...state, patients: [action.patient, ...state.patients] }
    case "add-appointment":
      return {
        ...state,
        appointments: [action.appointment, ...state.appointments],
      }
    case "update-appointment":
      return {
        ...state,
        appointments: state.appointments.map((item) =>
          item.id === action.appointment.id ? action.appointment : item,
        ),
      }
    case "add-supply":
      return { ...state, supplies: [action.supply, ...state.supplies] }
    case "update-supply":
      return {
        ...state,
        supplies: state.supplies.map((item) =>
          item.id === action.supply.id ? action.supply : item,
        ),
      }
    case "adjust-supply":
      return {
        ...state,
        supplies: state.supplies.map((item) =>
          item.id === action.id
            ? { ...item, quantity: Math.max(0, item.quantity + action.delta) }
            : item,
        ),
      }
    case "add-surgery":
      return { ...state, surgeries: [action.surgery, ...state.surgeries] }
    case "patch-surgery":
      return mapSurgery(state, action.id, (surgery) => ({
        ...surgery,
        ...action.patch,
        id: surgery.id,
      }))
    case "upsert-material":
      return mapSurgery(state, action.surgeryId, (surgery) => ({
        ...surgery,
        materials: upsert(surgery.materials, action.line),
      }))
    case "remove-material": {
      const surgery = state.surgeries.find((item) => item.id === action.surgeryId)
      const line = surgery?.materials.find((item) => item.id === action.lineId)
      const next = mapSurgery(state, action.surgeryId, (current) => ({
        ...current,
        materials: current.materials.filter((item) => item.id !== action.lineId),
      }))
      if (!line?.deducted || !line.supplyId) return next
      return {
        ...next,
        supplies: next.supplies.map((supply) =>
          supply.id === line.supplyId
            ? { ...supply, quantity: supply.quantity + line.quantity }
            : supply,
        ),
      }
    }
    case "upsert-labor":
      return mapSurgery(state, action.surgeryId, (surgery) => ({
        ...surgery,
        labor: upsert(surgery.labor, action.line),
      }))
    case "remove-labor":
      return mapSurgery(state, action.surgeryId, (surgery) => ({
        ...surgery,
        labor: surgery.labor.filter((line) => line.id !== action.lineId),
      }))
    case "upsert-charge":
      return mapSurgery(state, action.surgeryId, (surgery) => ({
        ...surgery,
        charges: upsert(surgery.charges, action.line),
      }))
    case "remove-charge":
      return mapSurgery(state, action.surgeryId, (surgery) => ({
        ...surgery,
        charges: surgery.charges.filter((line) => line.id !== action.lineId),
      }))
    case "start-reconciliation": {
      if (state.reconciliations.some((session) => session.status === "open")) return state
      const today = dayStamp()
      const entries: ReconciliationEntry[] = dueSupplies(state.supplies, today).map((supply) => ({
        supplyId: supply.id,
        expected: supply.quantity,
        counted: null,
        resolved: false,
      }))
      const session: ReconciliationSession = {
        id: newId("rec"),
        date: today,
        performedBy: MOCK_USER.name,
        status: "open",
        entries,
      }
      return { ...state, reconciliations: [session, ...state.reconciliations] }
    }
    case "set-count":
      return mapSession(state, action.sessionId, (session) => ({
        ...session,
        entries: session.entries.map((entry) => {
          if (entry.supplyId !== action.supplyId) return entry
          const next = { ...entry, counted: action.counted }
          const supply = state.supplies.find((item) => item.id === entry.supplyId)
          return supply ? { ...next, resolved: entryResolved(next, supply) } : next
        }),
      }))
    case "set-reason":
      return mapSession(state, action.sessionId, (session) => ({
        ...session,
        entries: session.entries.map((entry) => {
          if (entry.supplyId !== action.supplyId) return entry
          const next = {
            ...entry,
            reason: action.reason,
            note: action.note,
            witness: action.witness,
          }
          const supply = state.supplies.find((item) => item.id === entry.supplyId)
          return supply ? { ...next, resolved: entryResolved(next, supply) } : next
        }),
      }))
    case "sign-reconciliation": {
      const session = state.reconciliations.find((item) => item.id === action.sessionId)
      if (!session || session.status === "signed") return state
      if (canSignOff(session, state.supplies).length > 0) return state
      const counted = new Map(
        session.entries
          .filter((entry) => entry.counted != null)
          .map((entry) => [entry.supplyId, entry.counted as number]),
      )
      return {
        ...state,
        supplies: state.supplies.map((supply) =>
          counted.has(supply.id)
            ? {
                ...supply,
                quantity: counted.get(supply.id) ?? supply.quantity,
                lastReconciledAt: session.date,
              }
            : supply,
        ),
        reconciliations: state.reconciliations.map((item) =>
          item.id === session.id
            ? {
                ...item,
                status: "signed" as const,
                signedAt: dayStamp(),
                signedBy: MOCK_USER.name,
              }
            : item,
        ),
      }
    }
    case "record-device-usage": {
      if (action.entries.length === 0) return state
      const decrements = new Map<string, number>()
      for (const entry of action.entries) {
        decrements.set(entry.supplyId, (decrements.get(entry.supplyId) ?? 0) + entry.qty)
      }
      return {
        ...state,
        supplies: state.supplies.map((supply) =>
          decrements.has(supply.id)
            ? { ...supply, quantity: Math.max(0, supply.quantity - (decrements.get(supply.id) ?? 0)) }
            : supply,
        ),
        usageLog: [...action.entries, ...state.usageLog],
      }
    }
    default:
      return state
  }
}

function mapSession(
  state: AppState,
  id: string,
  update: (session: ReconciliationSession) => ReconciliationSession,
): AppState {
  return {
    ...state,
    reconciliations: state.reconciliations.map((session) =>
      session.id === id ? update(session) : session,
    ),
  }
}

type StoreValue = AppState & {
  ready: boolean
  dispatch: (action: Action) => void
}

const StoreContext = createContext<StoreValue | null>(null)

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false
  const state = value as AppState
  return (
    Array.isArray(state.patients) &&
    Array.isArray(state.appointments) &&
    Array.isArray(state.supplies) &&
    Array.isArray(state.surgeries)
  )
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, seedState)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (isAppState(parsed)) {
          dispatch({
            type: "hydrate",
            state: {
              ...parsed,
              reconciliations: parsed.reconciliations ?? [],
              usageLog: parsed.usageLog ?? [],
            },
          })
        }
      }
    } catch {
      /* keep seed */
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [ready, state])

  const value = useMemo(
    () => ({ ...state, ready, dispatch }),
    [state, ready],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error("useStore must be used inside StoreProvider")
  return store
}
