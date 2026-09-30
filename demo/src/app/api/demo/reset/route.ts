import { NextResponse } from "next/server"

import { createServiceSupabase } from "@/lib/supabase"
import { SEED_SUPPLIES } from "@/lib/supabase-seed"

export const runtime = "nodejs"

/** Restore demo inventory: clear usage_log and upsert seed supply quantities. */
export async function POST() {
  try {
    const supabase = createServiceSupabase()

    const { error: clearError } = await supabase.from("usage_log").delete().neq("id", "")
    if (clearError) throw clearError

    const rows = SEED_SUPPLIES.map((row) => ({
      ...row,
      updated_at: new Date().toISOString(),
    }))

    const { error: upsertError } = await supabase.from("supplies").upsert(rows, {
      onConflict: "id",
    })
    if (upsertError) throw upsertError

    return NextResponse.json({
      ok: true,
      supplies: rows.length,
      usage_log_cleared: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
