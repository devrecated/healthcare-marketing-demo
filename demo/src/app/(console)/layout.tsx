"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

import { SidebarBrand, SidebarNav, SidebarUser } from "@/components/console/sidebar"
import { Topbar } from "@/components/console/topbar"
import { signOut, isSignedIn } from "@/lib/session"
import { StoreProvider } from "@/lib/store"

gsap.registerPlugin(useGSAP)

const COLLAPSE_KEY = "acme-sidebar"

function titleFor(pathname: string) {
  if (pathname.startsWith("/surgery-costs")) return "Surgery costs"
  if (pathname.startsWith("/risk-predictor")) return "Risk predictor"
  if (pathname.startsWith("/patients")) return "Patients"
  if (pathname.startsWith("/appointments")) return "Appointments"
  if (pathname.startsWith("/inventory")) return "Supplies"
  return "Overview"
}

function DesktopRail({
  collapsed,
  children,
}: {
  collapsed: boolean
  children: ReactNode
}) {
  const rail = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const width = collapsed ? 72 : 256
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (reduce) {
        gsap.set(rail.current, { width })
        return
      }
      gsap.to(rail.current, { width, duration: 0.32, ease: "power2.out" })
    },
    { dependencies: [collapsed], scope: rail },
  )

  return (
    <aside
      ref={rail}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar md:flex"
      style={{ width: collapsed ? 72 : 256 }}
    >
      {children}
    </aside>
  )
}

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [auth, setAuth] = useState<"unknown" | "in" | "out">("unknown")
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setAuth(isSignedIn() ? "in" : "out")
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1")
  }, [])

  useEffect(() => {
    if (auth === "out") router.replace("/login")
  }, [auth, router])

  function toggle() {
    setCollapsed((value) => {
      const next = !value
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      return next
    })
  }

  function leave() {
    signOut()
    setAuth("out")
  }

  if (auth !== "in") {
    return <div className="min-h-dvh bg-background" />
  }

  return (
    <StoreProvider>
      <div className="flex min-h-dvh bg-background">
        <DesktopRail collapsed={collapsed}>
          <SidebarBrand collapsed={collapsed} onToggle={toggle} />
          <SidebarNav collapsed={collapsed} />
          <SidebarUser collapsed={collapsed} onSignOut={leave} />
        </DesktopRail>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar title={titleFor(pathname)} onSignOut={leave} />
          <main className="flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-8">
            {children}
          </main>
        </div>
      </div>
    </StoreProvider>
  )
}
