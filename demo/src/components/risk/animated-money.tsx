"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

import { cn } from "@/lib/utils"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const state = useRef({ value: 0 })

  useGSAP(
    () => {
      const apply = (v: number) => {
        if (ref.current) ref.current.textContent = money.format(v)
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        state.current.value = value
        apply(value)
        return
      }
      gsap.to(state.current, {
        value,
        duration: 0.7,
        ease: "power2.out",
        onUpdate: () => apply(state.current.value),
      })
    },
    { dependencies: [value] },
  )

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {money.format(0)}
    </span>
  )
}
