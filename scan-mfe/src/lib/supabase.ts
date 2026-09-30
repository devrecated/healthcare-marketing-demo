import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Supply } from "@/lib/extraction"

export type DbSupply = {
  id: string
  name: string
  category: string
  sku: string
  quantity: number
  unit: string
  reorder_level: number
  unit_cost: number
  controlled: boolean
  lot_expiry: string | null
  last_reconciled_at: string | null
}

export function mapSupply(row: DbSupply): Supply {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sku: row.sku,
    quantity: row.quantity,
    unit: row.unit,
    reorderLevel: row.reorder_level,
    unitCost: Number(row.unit_cost),
    controlled: row.controlled || undefined,
    lotExpiry: row.lot_expiry ?? undefined,
    lastReconciledAt: row.last_reconciled_at ?? undefined,
  }
}

export function requirePublicEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
  }
  return { url, anonKey }
}

let browserClient: SupabaseClient | null = null

export function createBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient
  const { url, anonKey } = requirePublicEnv()
  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return browserClient
}

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

export function apiBase() {
  return (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") || "http://localhost:3000"
}

export function hostUrl() {
  return (import.meta.env.VITE_HOST_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:3000"
}
