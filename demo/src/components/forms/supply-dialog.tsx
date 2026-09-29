"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Choice, Field } from "@/components/forms/patient-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { newId } from "@/lib/id"
import { useStore } from "@/lib/store"
import { SUPPLY_CATEGORIES, type Supply, type SupplyCategory } from "@/lib/types"

const empty = {
  name: "",
  category: "Consumable" as SupplyCategory,
  sku: "",
  quantity: "0",
  unit: "each",
  reorderLevel: "5",
  unitCost: "0",
  controlled: false,
  lotExpiry: "",
}

export function SupplyDialog({
  supply,
  trigger,
}: {
  supply?: Supply
  trigger?: React.ReactNode
}) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(supply ? toForm(supply) : empty)

  function save() {
    if (form.name.trim().length < 2 || form.sku.trim().length < 2) {
      toast.error("Name and SKU are required")
      return
    }
    const next: Supply = {
      id: supply?.id ?? newId("sup"),
      name: form.name.trim(),
      category: form.category,
      sku: form.sku.trim(),
      quantity: Number(form.quantity) || 0,
      unit: form.unit.trim() || "each",
      reorderLevel: Number(form.reorderLevel) || 0,
      unitCost: Number(form.unitCost) || 0,
      controlled: form.controlled,
      lotExpiry: form.lotExpiry || undefined,
      lastReconciledAt: supply?.lastReconciledAt,
    }
    dispatch({ type: supply ? "update-supply" : "add-supply", supply: next })
    toast(supply ? "Supply updated" : "Supply added")
    if (!supply) setForm(empty)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setForm(supply ? toForm(supply) : empty)
      }}
    >
      <DialogTrigger render={<Button className="min-h-11" variant={supply ? "outline" : "default"} />}>
        {trigger ?? (supply ? "Edit" : "Add supply")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{supply ? "Edit supply" : "Add a supply"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input className="min-h-11" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="SKU">
            <Input className="min-h-11" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
          </Field>
          <Choice
            label="Category"
            value={form.category}
            options={SUPPLY_CATEGORIES}
            onChange={(value) => setForm({ ...form, category: value as SupplyCategory })}
          />
          <Field label="Unit">
            <Input className="min-h-11" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
          </Field>
          <Field label="On hand">
            <Input className="min-h-11" type="number" min={0} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
          </Field>
          <Field label="Reorder at">
            <Input className="min-h-11" type="number" min={0} value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })} />
          </Field>
          <Field label="Expiry">
            <Input className="min-h-11" type="date" value={form.lotExpiry} onChange={(event) => setForm({ ...form, lotExpiry: event.target.value })} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={form.controlled} onCheckedChange={(checked) => setForm({ ...form, controlled: checked === true })} />
            Controlled substance
          </label>
          <Field label="Unit cost (USD)">
            <Input className="min-h-11" type="number" min={0} step="0.01" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button className="min-h-11" onClick={save}>
            Save supply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function toForm(supply: Supply) {
  return {
    name: supply.name,
    category: supply.category,
    sku: supply.sku,
    quantity: String(supply.quantity),
    unit: supply.unit,
    reorderLevel: String(supply.reorderLevel),
    unitCost: String(supply.unitCost),
    controlled: Boolean(supply.controlled),
    lotExpiry: supply.lotExpiry ?? "",
  }
}
