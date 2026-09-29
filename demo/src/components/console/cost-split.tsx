export function CostSplit({
  materials,
  labor,
  charges,
}: {
  materials: number
  labor: number
  charges: number
}) {
  const total = materials + labor + charges
  const parts = [
    { label: "Materials", amount: materials, className: "bg-primary" },
    { label: "Staff hours", amount: labor, className: "bg-[oklch(0.62_0.12_55)]" },
    { label: "Facility", amount: charges, className: "bg-[oklch(0.55_0.06_230)]" },
  ]
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {total === 0
          ? null
          : parts.map((part) => (
              <div
                key={part.label}
                className={part.className}
                style={{ width: `${(part.amount / total) * 100}%` }}
              />
            ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${part.className}`} />
            {part.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
