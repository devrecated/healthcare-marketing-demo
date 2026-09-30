/** Public URL of the scan microfrontend (separate Vite deploy). */
export function getScanMfeUrl() {
  return (process.env.NEXT_PUBLIC_SCAN_MFE_URL || "http://localhost:5173").replace(/\/$/, "")
}
