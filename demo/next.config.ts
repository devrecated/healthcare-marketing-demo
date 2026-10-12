import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Root also has a pnpm-lock for Playwright; keep Turbopack rooted on this app.
  turbopack: {
    root: path.join(__dirname),
  },
}

export default nextConfig
