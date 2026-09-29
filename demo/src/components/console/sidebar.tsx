"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  CalendarClock,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Package,
  Scissors,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MOCK_USER } from "@/lib/session"

const links = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/inventory", label: "Supplies", icon: Package },
  { href: "/surgery-costs", label: "Surgery costs", icon: Scissors },
  { href: "/risk-predictor", label: "Risk predictor", icon: Activity },
]

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-2">
      {links.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(`${link.href}/`)
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            title={link.label}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-0",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {collapsed ? <span className="sr-only">{link.label}</span> : link.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function SidebarBrand({
  collapsed,
  onToggle,
}: {
  collapsed?: boolean
  onToggle?: () => void
}) {
  return (
    <div className={cn("flex items-start gap-2 px-3 py-5", collapsed && "flex-col items-center")}>
      <div className={cn("min-w-0 flex-1", collapsed && "text-center")}>
        <p className="font-heading text-2xl tracking-tight text-sidebar-foreground">
          {collapsed ? "W" : "Wardline"}
        </p>
        {collapsed ? null : (
          <p className="mt-1 text-xs tracking-wide text-sidebar-foreground/70">Clinic operations</p>
        )}
      </div>
      {onToggle ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggle}
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
        </Button>
      ) : null}
    </div>
  )
}

export function SidebarUser({
  collapsed,
  onSignOut,
}: {
  collapsed?: boolean
  onSignOut: () => void
}) {
  return (
    <div className="mt-auto border-t border-sidebar-border p-3">
      <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
        <span
          title={MOCK_USER.name}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
        >
          {MOCK_USER.initials}
        </span>
        {collapsed ? null : (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{MOCK_USER.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{MOCK_USER.role}</p>
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "mt-2 min-h-11 w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          collapsed && "px-0",
        )}
        title="Sign out"
        onClick={onSignOut}
      >
        <LogOut />
        {collapsed ? <span className="sr-only">Sign out</span> : "Sign out"}
      </Button>
    </div>
  )
}
