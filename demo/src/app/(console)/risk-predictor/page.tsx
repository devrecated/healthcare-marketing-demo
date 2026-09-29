"use client"

import { useMemo, useState } from "react"

import { PageIntro } from "@/components/console/stat-card"
import { Reveal } from "@/components/console/reveal"
import { Choice } from "@/components/forms/patient-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { AnimatedMoney } from "@/components/risk/animated-money"
import { CostCurve } from "@/components/risk/cost-curve"
import { CostDistribution } from "@/components/risk/cost-distribution"
import { FactorBars } from "@/components/risk/factor-bars"
import { RiskGauge, riskBand } from "@/components/risk/risk-gauge"
import { DATASET_BOUNDS, REGIONS, type RegionName } from "@/lib/insurance-dataset"
import { factorContributions, getModel, predictCharges, riskScore, type RiskInput } from "@/lib/risk-model"

const REGION_LABELS: Record<RegionName, string> = {
  northeast: "Northeast",
  northwest: "Northwest",
  southeast: "Southeast",
  southwest: "Southwest",
}

const DEFAULT_INPUT: RiskInput = {
  age: 35,
  sex: "female",
  bmi: 27,
  children: 0,
  smoker: false,
  region: "northeast",
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="h-11 w-full cursor-pointer accent-primary"
      />
    </div>
  )
}

export default function RiskPredictorPage() {
  const [input, setInput] = useState<RiskInput>(DEFAULT_INPUT)

  const { predictedCost, score, base, contributions, r2 } = useMemo(() => {
    const { r2 } = getModel()
    const { base, contributions } = factorContributions(input)
    return {
      predictedCost: predictCharges(input),
      score: riskScore(input),
      base,
      contributions,
      r2,
    }
  }, [input])

  const band = riskBand(score)

  function set<K extends keyof RiskInput>(key: K, value: RiskInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      <PageIntro eyebrow="Prediction" title="Risk predictor" />

      <Reveal>
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Controls */}
          <Card className="lg:col-span-2" data-reveal>
            <CardHeader>
              <CardTitle>Individual factors</CardTitle>
              <CardDescription>Adjust the inputs to see cost and risk update live.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <SliderField
                label="Age"
                value={input.age}
                min={DATASET_BOUNDS.age[0]}
                max={DATASET_BOUNDS.age[1]}
                display={`${input.age} yrs`}
                onChange={(value) => set("age", value)}
              />
              <SliderField
                label="BMI"
                value={input.bmi}
                min={DATASET_BOUNDS.bmi[0]}
                max={DATASET_BOUNDS.bmi[1]}
                step={0.1}
                display={input.bmi.toFixed(1)}
                onChange={(value) => set("bmi", Math.round(value * 10) / 10)}
              />
              <SliderField
                label="Children"
                value={input.children}
                min={DATASET_BOUNDS.children[0]}
                max={DATASET_BOUNDS.children[1]}
                display={String(input.children)}
                onChange={(value) => set("children", value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  label="Sex"
                  value={input.sex}
                  options={[
                    { value: "female", label: "Female" },
                    { value: "male", label: "Male" },
                  ]}
                  onChange={(value) => set("sex", value as RiskInput["sex"])}
                />
                <Choice
                  label="Region"
                  value={input.region}
                  options={REGIONS.map((region) => ({ value: region, label: REGION_LABELS[region] }))}
                  onChange={(value) => set("region", value as RegionName)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Smoker</Label>
                <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
                  {[
                    { value: false, label: "Non-smoker" },
                    { value: true, label: "Smoker" },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => set("smoker", option.value)}
                      className={
                        "min-h-9 flex-1 rounded-md px-3 font-medium transition-colors " +
                        (input.smoker === option.value
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Result */}
          <Card className="lg:col-span-3" data-reveal>
            <CardHeader>
              <CardTitle>Estimated annual cost, before insurance</CardTitle>
              <CardDescription>
                Predicted by a linear regression trained in your browser on {getModel().sortedCharges.length.toLocaleString()} records.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid items-center gap-6 sm:grid-cols-2">
              <div>
                <AnimatedMoney
                  value={predictedCost}
                  className="font-heading text-5xl tracking-tight"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  Risk score{" "}
                  <span className="font-medium" style={{ color: band.color }}>
                    {score}/100
                  </span>{" "}
                  · {band.label}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Model fit R² {r2.toFixed(2)}. This is a statistical estimate, not medical advice.
                </p>
              </div>
              <RiskGauge score={score} />
            </CardContent>
          </Card>
        </div>
      </Reveal>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What drives this estimate</CardTitle>
            <CardDescription>
              Baseline (average person): {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(base)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FactorBars contributions={contributions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost sensitivity</CardTitle>
            <CardDescription>How the estimate moves as one factor changes.</CardDescription>
          </CardHeader>
          <CardContent>
            <CostCurve input={input} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Where this person lands</CardTitle>
          <CardDescription>Predicted cost against the full dataset distribution.</CardDescription>
        </CardHeader>
        <CardContent>
          <CostDistribution predictedCost={predictedCost} score={score} />
        </CardContent>
      </Card>
    </div>
  )
}
