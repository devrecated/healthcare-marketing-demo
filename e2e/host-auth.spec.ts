import { expect, test } from "@playwright/test"

import { assertNoForbiddenBrand } from "./helpers"

test.describe("host auth", () => {
  test("gates console and signs in with demo credentials", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText("Acme Healthcare").first()).toBeVisible()
    await assertNoForbiddenBrand(page)

    const email = page.locator("#email")
    const password = page.locator("#password")

    await email.fill("wrong@example.com")
    await password.fill("acme")
    await page.getByRole("button", { name: "Enter console" }).click()
    await expect(page.getByText("Use the demo email shown above")).toBeVisible()

    await email.fill("amara.okonkwo@acme.clinic")
    await password.fill("nope")
    await page.getByRole("button", { name: "Enter console" }).click()
    await expect(page.getByText("That password does not open the console")).toBeVisible()

    await password.fill("acme")
    await page.getByRole("button", { name: "Enter console" }).click()
    await expect(page.getByRole("heading", { name: /Clinic board|Ward board/ })).toBeVisible()
    await assertNoForbiddenBrand(page)

    await page.getByRole("button", { name: /Sign out/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})
