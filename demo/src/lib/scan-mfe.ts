/** Public URL of the scan microfrontend (Vite app). */
export function getScanMfeUrl() {
  const configured = process.env.NEXT_PUBLIC_SCAN_MFE_URL
  if (configured) return configured.replace(/\/$/, "")
  // Vercel multi-service mounts the MFE at /scan on the same domain.
  if (process.env.VERCEL) return "/scan"
  return "http://localhost:5173"
}
