import { useCallback, useEffect, useState } from "react"
import { Toaster } from "sonner"

import { Login } from "@/components/Login"
import { isSignedIn } from "@/lib/session"
import { ScanApp } from "@/ScanApp"

export default function App() {
  const [auth, setAuth] = useState<"unknown" | "in" | "out">("unknown")

  useEffect(() => {
    setAuth(isSignedIn() ? "in" : "out")
  }, [])

  const onSignedIn = useCallback(() => setAuth("in"), [])
  const onSignedOut = useCallback(() => setAuth("out"), [])

  if (auth === "unknown") {
    return <div className="min-h-dvh bg-background" />
  }

  return (
    <>
      <Toaster position="top-center" />
      {auth === "in" ? <ScanApp onSignedOut={onSignedOut} /> : <Login onSignedIn={onSignedIn} />}
    </>
  )
}
