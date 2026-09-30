import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Supply, UsageLogEntry } from "@/lib/types"

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
  updated_at?: string
}

export type DbUsageLog = {
  id: string
  form_id: string | null
  procedure_date: string | null
  center_hint: string | null
  supply_id: string
  sku: string
  device: string
  qty: number
  approved_by: string
  raw_sticker_text: string
  recorded_at: string
}

export function mapSupply(row: DbSupply): Supply {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Supply["category"],
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

export function mapUsageLog(row: DbUsageLog): UsageLogEntry {
  return {
    id: row.id,
    formId: row.form_id,
    procedureDate: row.procedure_date,
    centerHint: row.center_hint,
    supplyId: row.supply_id,
    sku: row.sku,
    device: row.device,
    qty: row.qty,
    approvedBy: row.approved_by,
    rawStickerText: row.raw_sticker_text,
    recordedAt: row.recorded_at,
  }
}

export function requirePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in demo/.env.local.",
    )
  }
  return { url, anonKey }
}

let browserClient: SupabaseClient | null = null

/** One shared browser client — avoids "Multiple GoTrueClient instances" warnings. */
export function createBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient
  const { url, anonKey } = requirePublicEnv()
  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return browserClient
}

export function createServiceSupabase(): SupabaseClient {
  const { url } = requirePublicEnv()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to demo/.env.local (server only).",
    )
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
