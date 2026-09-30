export const DEMO_GATE = "acme"
export const DEMO_EMAIL = "amara.okonkwo@acme.clinic"

const AUTH_KEY = "acme-scan-auth"

export function isSignedIn() {
  return localStorage.getItem(AUTH_KEY) === "1"
}

export function signIn(password: string) {
  if (password !== DEMO_GATE) return false
  localStorage.setItem(AUTH_KEY, "1")
  return true
}

export function signOut() {
  localStorage.removeItem(AUTH_KEY)
}
