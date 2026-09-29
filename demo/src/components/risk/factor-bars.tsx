"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/money"
import type { FactorContribution } from "@/lib/risk-model"

function signedMoney(amount: number) {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : ""
  return `${sign}${formatMoney(Math.abs(amount))}`
}

export function FactorBars({ contributions }: { contributions: FactorContribution[] }) {
  const root = useRef<HTMLDivElement>(null)
  const max = Math.max(1, ...contributions.map((c) => Math.abs(c.amount)))

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      gsap.from("[data-bar]", {
        scaleX: 0,
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.05,
      })
    },
    { dependencies: [contributions], scope: root },
  )

  return (
    <div ref={root} className="space-y-2.5">
      {contributions.map((factor) => {
        const positive = factor.amount >= 0
        const pct = (Math.abs(factor.amount) / max) * 50
        return (
          <div key={factor.key} className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-3">
            <span className="text-sm text-muted-foreground">{factor.label}</span>
            <div className="relative h-6 rounded-md bg-muted">
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
              <div
                data-bar
                className={cn(
                  "absolute inset-y-1 rounded",
                  positive ? "bg-destructive/80" : "bg-primary",
                )}
                style={{
                  left: positive ? "50%" : `${50 - pct}%`,
                  width: `${pct}%`,
                  transformOrigin: positive ? "left center" : "right center",
                }}
              />
            </div>
            <span
              className={cn(
                "text-right text-sm tabular-nums",
                positive ? "text-destructive" : "text-primary",
              )}
            >
              {signedMoney(factor.amount)}
            </span>
          </div>
        )
      })}
      <p className="pt-1 text-xs text-muted-foreground">
        Dollar impact of each factor versus the average person in the dataset.
      </p>
    </div>
  )
}
