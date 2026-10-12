import { expect, type Page } from "@playwright/test"

/** Prior-client / competitor brand strings that must never appear in the demo UI. */
export const FORBIDDEN_BRAND =
  /mountain\s*spring|podiatry|\bMSP\b|kenneth\s*pasquale/i

export async function assertNoForbiddenBrand(page: Page) {
  const text = await page.locator("body").innerText()
  expect(text).not.toMatch(FORBIDDEN_BRAND)
}

export async function seedHostAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("acme-auth", "1")
  })
}

export async function seedScanAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("acme-scan-auth", "1")
  })
}
