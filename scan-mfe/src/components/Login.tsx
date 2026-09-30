import { useState, type FormEvent } from "react"

import { Button } from "@/components/Button"
import { DEMO_EMAIL, DEMO_GATE, signIn } from "@/lib/session"

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!signIn(password)) {
      setError("That password does not open scan")
      return
    }
    onSignedIn()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-sm"
      >
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Acme Healthcare · Scan MFE
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Demo account <span className="font-medium text-foreground">{DEMO_EMAIL}</span>
          {" · password "}
          <span className="font-medium text-foreground">{DEMO_GATE}</span>
        </p>
        <label className="mt-6 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setError("")
          }}
        />
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <Button className="mt-4 min-h-11 w-full" type="submit">
          Open camera
        </Button>
      </form>
    </main>
  )
}
