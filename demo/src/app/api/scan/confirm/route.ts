import { NextResponse } from "next/server"
import { z } from "zod"

import { extractedDeviceSchema, matchDeviceToSupply } from "@/lib/extraction"
import { newId } from "@/lib/id"
import { createServiceSupabase, mapSupply, type DbSupply } from "@/lib/supabase"

export const runtime = "nodejs"

const confirmBodySchema = z.object({
  center_hint: z.string().nullable().optional(),
  procedure_date: z.string().nullable().optional(),
  form_id: z.string().nullable().optional(),
  devices: z.array(extractedDeviceSchema).min(1),
  approved_by: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const json: unknown = await request.json()
    const body = confirmBodySchema.parse(json)
    const supabase = createServiceSupabase()

    const { data: rows, error: loadError } = await supabase.from("supplies").select("*")
    if (loadError) throw loadError
    const supplies = (rows as DbSupply[]).map(mapSupply)

    const skipped: { product_name: string | null; ref: string | null; reason: string }[] = []
    const entries: Record<string, unknown>[] = []

    for (const device of body.devices) {
      const match = matchDeviceToSupply(device, supplies)
      if (!match) {
        skipped.push({
          product_name: device.product_name,
          ref: device.ref,
          reason: "No inventory match",
        })
        continue
      }
      const qty = 1
      entries.push({
        id: newId("use"),
        form_id: body.form_id ?? null,
        procedure_date: body.procedure_date ?? null,
        center_hint: body.center_hint ?? null,
        supply_id: match.supply.id,
        sku: match.supply.sku,
        device: device.product_name || match.supply.name,
        qty,
        approved_by: body.approved_by || "Amara Okonkwo",
        raw_sticker_text: device.raw_sticker_text,
      })
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No devices matched inventory SKUs.", skipped },
        { status: 422 },
      )
    }

    const { data: result, error: rpcError } = await supabase.rpc("confirm_scan_deduction", {
      entries,
    })
    if (rpcError) throw rpcError

    return NextResponse.json({
      deducted: (result as { deducted?: unknown })?.deducted ?? result,
      skipped,
      count: entries.length,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid confirm payload.", details: error.flatten() }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : "Confirm failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
