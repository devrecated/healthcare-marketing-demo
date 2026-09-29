"use client"

import { useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/money"
import { sweep, type RiskInput } from "@/lib/risk-model"
import { DATASET_BOUNDS } from "@/lib/insurance-dataset"

const W = 640
const H = 240
const PAD_L = 56
const PAD_R = 12
const PAD_T = 16
const PAD_B = 28

type SweepKey = "age" | "bmi"

export function CostCurve({ input }: { input: RiskInput }) {
  const [key, setKey] = useState<SweepKey>("age")
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)

  const points = useMemo(() => sweep(input, key, 60), [input, key])
  const [minV, maxV] = key === "age" ? DATASET_BOUNDS.age : DATASET_BOUNDS.bmi
  const maxCost = Math.max(...points.map((p) => p.cost)) * 1.05

  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const sx = (v: number) => PAD_L + ((v - minV) / (maxV - minV)) * plotW
  const sy = (c: number) => PAD_T + plotH - (c / maxCost) * plotH

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.value).toFixed(1)} ${sy(p.cost).toFixed(1)}`).join(" ")
  const area = `${line} L ${sx(points[points.length - 1].value).toFixed(1)} ${PAD_T + plotH} L ${sx(points[0].value).toFixed(1)} ${PAD_T + plotH} Z`

  const userValue = key === "age" ? input.age : input.bmi
  const userCost = points.reduce((best, p) =>
    Math.abs(p.value - userValue) < Math.abs(best.value - userValue) ? p : best,
  ).cost

  // Hover readout
  const hovered = useMemo(() => {
    if (hoverX == null) return null
    const value = minV + ((hoverX - PAD_L) / plotW) * (maxV - minV)
    if (value < minV || value > maxV) return null
    return points.reduce((best, p) =>
      Math.abs(p.value - value) < Math.abs(best.value - value) ? p : best,
    )
  }, [hoverX, minV, maxV, plotW, points])

  const yTicks = 4
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (maxCost / yTicks) * i)

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    setHoverX(x)
  }

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg bg-muted p-1 text-sm">
        {(["age", "bmi"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKey(option)}
            className={cn(
              "min-h-9 rounded-md px-3 font-medium transition-colors",
              key === option
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "age" ? "By age" : "By BMI"}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Predicted annual cost as ${key} varies, holding other factors fixed.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={sy(t)}
              y2={sy(t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 8}
              y={sy(t) + 4}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: 10 }}
            >
              {formatMoney(t)}
            </text>
          </g>
        ))}

        <path d={area} fill="var(--primary)" opacity={0.1} />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" />

        {/* User point */}
        <line
          x1={sx(userValue)}
          x2={sx(userValue)}
          y1={PAD_T}
          y2={PAD_T + plotH}
          stroke="var(--destructive)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <circle cx={sx(userValue)} cy={sy(userCost)} r={5} className="fill-destructive stroke-card" strokeWidth={2} />

        {/* Hover readout */}
        {hovered ? (
          <g>
            <circle cx={sx(hovered.value)} cy={sy(hovered.cost)} r={4} className="fill-primary" />
            <text
              x={Math.min(W - PAD_R, Math.max(PAD_L, sx(hovered.value)))}
              y={PAD_T + 4}
              textAnchor="middle"
              className="fill-foreground"
              style={{ fontSize: 11, fontWeight: 500 }}
            >
              {`${key === "age" ? Math.round(hovered.value) : hovered.value.toFixed(1)} ${
                key === "age" ? "yrs" : "BMI"
              } · ${formatMoney(hovered.cost)}`}
            </text>
          </g>
        ) : null}

        {/* X axis labels */}
        <text x={PAD_L} y={H - 8} className="fill-muted-foreground" style={{ fontSize: 10 }}>
          {key === "age" ? `${minV} yrs` : `BMI ${minV}`}
        </text>
        <text
          x={W - PAD_R}
          y={H - 8}
          textAnchor="end"
          className="fill-muted-foreground"
          style={{ fontSize: 10 }}
        >
          {key === "age" ? `${maxV} yrs` : `BMI ${maxV}`}
        </text>
      </svg>
    </div>
  )
}
