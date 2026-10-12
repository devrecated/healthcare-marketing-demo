import { expect, test } from "@playwright/test"

import { assertNoForbiddenBrand, seedHostAuth, seedScanAuth } from "./helpers"

test.describe("brand guard", () => {
  test("public surface has no prior-client branding", async ({ page }, testInfo) => {
    const isScan = testInfo.project.name === "scan-mobile"
    if (isScan) {
      await seedScanAuth(page)
      await page.goto("/")
      await expect(page.getByText(/Acme|Scan|Device form/i).first()).toBeVisible()
    } else {
      await seedHostAuth(page)
      await page.goto("/")
      await expect(page.getByText("Acme Healthcare").first()).toBeVisible()
      await page.goto("/login")
      await expect(page.getByText("Acme Healthcare").first()).toBeVisible()
    }
    await assertNoForbiddenBrand(page)
  })
})
