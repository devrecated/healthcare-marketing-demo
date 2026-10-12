import { expect, test } from "@playwright/test"

import { assertNoForbiddenBrand, seedHostAuth } from "./helpers"

test.describe("host console smoke", () => {
  test.beforeEach(async ({ page }) => {
    await seedHostAuth(page)
  })

  test("walks core inventory routes", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: /Clinic board|Ward board/ })).toBeVisible()
    await expect(page.getByText("Acme Healthcare").first()).toBeVisible()
    await assertNoForbiddenBrand(page)

    await page.goto("/inventory")
    await expect(page.getByRole("heading", { name: /Medical supplies/i })).toBeVisible()
    await assertNoForbiddenBrand(page)

    await page.goto("/inventory/intake")
    await expect(page.getByText("Mock forms").first()).toBeVisible()
    await assertNoForbiddenBrand(page)

    await page.goto("/inventory/usage")
    await expect(page.getByRole("heading", { name: /Device usage log/i })).toBeVisible()
    await assertNoForbiddenBrand(page)

    await page.goto("/patients")
    await expect(page.getByText(/Patient/i).first()).toBeVisible()

    await page.goto("/appointments")
    await expect(page.getByText(/Appointment|Calendar|Schedule/i).first()).toBeVisible()
  })
})
