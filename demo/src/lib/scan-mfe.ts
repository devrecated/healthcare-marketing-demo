/** Public URL of the scan microfrontend (Vite app). */
export function getScanMfeUrl() {
  return (process.env.NEXT_PUBLIC_SCAN_MFE_URL || "http://localhost:5173").replace(/\/$/, "")
}
