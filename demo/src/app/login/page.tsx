"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { Eye, EyeOff } from "lucide-react"

import { LoginBackdrop } from "@/components/login/login-backdrop"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DEMO_EMAIL, DEMO_GATE, isSignedIn, signIn } from "@/lib/session"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (isSignedIn()) router.replace("/")
  }, [router])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (email.trim().toLowerCase() !== DEMO_EMAIL) {
      setError("Use the demo email shown above")
      return
    }
    if (password.trim().length === 0) {
      setError("Enter the password")
      return
    }
    if (!signIn(password)) {
      setError("That password does not open the console")
      return
    }
    router.replace("/")
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <LoginBackdrop />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/15 bg-[#f7f3ea]/95 p-8 text-foreground shadow-2xl backdrop-blur"
      >
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Wardline
        </p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Demo account{" "}
          <span className="font-medium text-foreground">{DEMO_EMAIL}</span>
          {" · password "}
          <span className="font-medium text-foreground">{DEMO_GATE}</span>
        </p>
        <div className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              className="min-h-11 border-foreground/25 bg-white"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError("")
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <div className="flex gap-2">
              <Input
                id="password"
                className="min-h-11 border-foreground/25 bg-white"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError("")
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11 border-foreground/25 bg-white"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((value) => !value)}
              >
                {show ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <Button type="submit" className="mt-6 min-h-11 w-full">
          Enter console
        </Button>
      </form>
    </main>
  )
}
