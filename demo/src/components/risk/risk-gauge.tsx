"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

gsap.registerPlugin(useGSAP)

const R = 80
const CX = 100
const CY = 100
const ARC_LENGTH = Math.PI * R
const ARC_PATH = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

export function riskBand(score: number): { label: string; color: string } {
  if (score <= 33) return { label: "Lower risk", color: "var(--primary)" }
  if (score <= 66) return { label: "Moderate risk", color: "oklch(0.7 0.15 70)" }
  return { label: "Higher risk", color: "var(--destructive)" }
}

export function RiskGauge({ score }: { score: number }) {
  const root = useRef<HTMLDivElement>(null)
  const arc = useRef<SVGPathElement>(null)
  const number = useRef<SVGTextElement>(null)
  const state = useRef({ score: 0 })

  useGSAP(
    () => {
      const target = Math.min(100, Math.max(1, score))
      const apply = (v: number) => {
        if (arc.current) {
          arc.current.style.strokeDashoffset = String(ARC_LENGTH * (1 - v / 100))
        }
        if (number.current) number.current.textContent = String(Math.round(v))
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        state.current.score = target
        apply(target)
        return
      }
      gsap.to(state.current, {
        score: target,
        duration: 0.7,
        ease: "power2.out",
        onUpdate: () => apply(state.current.score),
      })
    },
    { dependencies: [score], scope: root },
  )

  const band = riskBand(score)

  return (
    <div ref={root} className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 118"
        className="w-full max-w-[18rem]"
        role="img"
        aria-label={`Risk score ${Math.round(score)} out of 100 — ${band.label}`}
      >
        <path
          d={ARC_PATH}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={16}
          strokeLinecap="round"
        />
        <path
          ref={arc}
          d={ARC_PATH}
          fill="none"
          stroke={band.color}
          strokeWidth={16}
          strokeLinecap="round"
          style={{
            strokeDasharray: ARC_LENGTH,
            strokeDashoffset: ARC_LENGTH,
            transition: "stroke 0.3s ease",
          }}
        />
        <text
          ref={number}
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          className="fill-foreground font-heading"
          style={{ fontSize: 38, fontWeight: 500 }}
        >
          0
        </text>
        <text
          x={CX}
          y={CY + 14}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 11, letterSpacing: 1 }}
        >
          / 100
        </text>
      </svg>
      <span
        className="mt-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
        style={{ color: band.color, backgroundColor: "color-mix(in oklch, currentColor 14%, transparent)" }}
      >
        {band.label}
      </span>
    </div>
  )
}
