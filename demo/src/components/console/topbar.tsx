"use client"

import { Menu, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { SidebarBrand, SidebarNav, SidebarUser } from "@/components/console/sidebar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useStore } from "@/lib/store"
import { useState } from "react"

export function Topbar({
  title,
  onSignOut,
}: {
  title: string
  onSignOut: () => void
}) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11 md:hidden"
                aria-label="Open navigation"
              />
            }
          >
            <Menu />
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col bg-sidebar p-0 text-sidebar-foreground">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <SidebarBrand />
            <SidebarNav onNavigate={() => setOpen(false)} />
            <SidebarUser
              onSignOut={() => {
                setOpen(false)
                onSignOut()
              }}
            />
          </SheetContent>
        </Sheet>
        <h1 className="font-heading text-xl tracking-tight md:text-2xl">{title}</h1>
      </div>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => {
          dispatch({ type: "reset" })
          toast("Demo data restored")
        }}
      >
        <RotateCcw />
        Reset data
      </Button>
    </header>
  )
}
