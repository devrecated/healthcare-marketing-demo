import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const tones = {
  spruce: "bg-primary/10 text-primary",
  clay: "bg-accent text-accent-foreground",
  ink: "bg-muted text-foreground",
  warn: "bg-amber-100 text-amber-950",
}

export function StatCard({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string
  value: string
  hint?: string
  tone?: keyof typeof tones
}) {
  return (
    <article
      data-reveal
      className="rounded-2xl border bg-card p-4 shadow-sm"
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-heading text-xl leading-tight tracking-tight break-words md:text-2xl xl:text-3xl">{value}</p>
      {hint ? (
        <p className={cn("mt-3 inline-flex rounded-full px-2 py-1 text-xs", tones[tone])}>
          {hint}
        </p>
      ) : null}
    </article>
  )
}

export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-heading text-3xl tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  )
}
