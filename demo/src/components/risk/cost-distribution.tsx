"use client"

import { useMemo, useRef, useState } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

import { formatMoney } from "@/lib/money"
import { CHARGE_MAX, getModel } from "@/lib/risk-model"

const BINS = 30
const W = 640
const H = 220
const PAD_X = 8
const PAD_TOP = 16
const PAD_BOTTOM = 28

export function CostDistribution({
  predictedCost,
  score,
}: {
  predictedCost: number
  score: number
}) {
  const root = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { bins, maxCount, upper } = useMemo(() => {
    const { sortedCharges } = getModel()
    const upper = CHARGE_MAX
    const counts = new Array<number>(BINS).fill(0)
    for (const value of sortedCharges) {
      const idx = Math.min(BINS - 1, Math.floor((value / upper) * BINS))
      counts[idx] += 1
    }
    return { bins: counts, maxCount: Math.max(...counts), upper }
  }, [])

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      gsap.from("[data-hist-bar]", {
        scaleY: 0,
        transformOrigin: "bottom",
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.01,
      })
    },
    { scope: root },
  )

  const plotW = W - PAD_X * 2
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const barW = plotW / BINS
  const markerX = PAD_X + Math.min(1, predictedCost / upper) * plotW

  return (
    <div>
      <svg
        ref={root}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Distribution of annual medical costs across the dataset. Your estimate of ${formatMoney(
          predictedCost,
        )} sits at the ${score}th percentile.`}
        onMouseLeave={() => setHover(null)}
      >
        {bins.map((count, i) => {
          const h = maxCount === 0 ? 0 : (count / maxCount) * plotH
          const x = PAD_X + i * barW
          const y = PAD_TOP + (plotH - h)
          const binStart = (i / BINS) * upper
          const active = hover === i
          return (
            <rect
              key={i}
              data-hist-bar
              x={x + 0.75}
              y={y}
              width={Math.max(0, barW - 1.5)}
              height={h}
              rx={2}
              className={active ? "fill-primary" : "fill-primary/35"}
              onMouseEnter={() => setHover(i)}
            >
              <title>{`${formatMoney(binStart)}–${formatMoney(
                binStart + upper / BINS,
              )}: ${count} people`}</title>
            </rect>
          )
        })}

        {/* User marker */}
        <line
          x1={markerX}
          x2={markerX}
          y1={PAD_TOP - 6}
          y2={PAD_TOP + plotH}
          stroke="var(--destructive)"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        <circle cx={markerX} cy={PAD_TOP - 6} r={4} className="fill-destructive" />

        {/* Axis labels */}
        <text x={PAD_X} y={H - 8} className="fill-muted-foreground" style={{ fontSize: 11 }}>
          {formatMoney(0)}
        </text>
        <text
          x={W - PAD_X}
          y={H - 8}
          textAnchor="end"
          className="fill-muted-foreground"
          style={{ fontSize: 11 }}
        >
          {formatMoney(upper)}
        </text>
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">
        Your estimate of <span className="font-medium text-foreground">{formatMoney(predictedCost)}</span>{" "}
        is higher than about <span className="font-medium text-foreground">{score}%</span> of people in
        the dataset.
      </p>
    </div>
  )
}
