import type { ButtonHTMLAttributes } from "react"

type Variant = "default" | "outline"

const variants: Record<Variant, string> = {
  default:
    "border-transparent bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50",
  outline:
    "border-border bg-background text-foreground hover:bg-muted disabled:opacity-50",
}

export function Button({
  className = "",
  variant = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium transition-opacity outline-none disabled:pointer-events-none ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
