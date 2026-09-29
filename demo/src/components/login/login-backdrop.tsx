"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

const Silk = dynamic(() => import("@/components/login/Silk"), { ssr: false })

export function LoginBackdrop() {
  const [mode, setMode] = useState<"wait" | "silk" | "still">("wait")

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setMode(reduce ? "still" : "silk")
  }, [])

  if (mode !== "silk") {
    return <div className="absolute inset-0 bg-[#16332f]" />
  }

  return (
    <div className="absolute inset-0">
      <Silk speed={3.5} scale={1.1} color="#1c3d38" noiseIntensity={1.15} rotation={0.15} />
    </div>
  )
}
