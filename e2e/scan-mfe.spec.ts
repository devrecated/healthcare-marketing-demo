import path from "node:path"

import { expect, test } from "@playwright/test"

import { assertNoForbiddenBrand } from "./helpers"

const fixturePng = path.resolve(
  __dirname,
  "../demo/fixtures/forms/form-richmond-knee.png",
)

test.describe("scan MFE mobile smoke", () => {
  test("signs in, queues fixture photo, reaches review shell", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Acme Healthcare · Scan")).toBeVisible()
    await assertNoForbiddenBrand(page)

    await page.getByLabel("Password").fill("wrong")
    await page.getByRole("button", { name: "Open camera" }).click()
    await expect(page.getByText("That password does not open scan")).toBeVisible()

    await page.getByLabel("Password").fill("acme")
    await page.getByRole("button", { name: "Open camera" }).click()
    await expect(page.getByRole("heading", { name: "Device form camera" })).toBeVisible()
    await assertNoForbiddenBrand(page)

    await page.getByRole("button", { name: "Add photos" }).click()
    await page.locator('input[type="file"]').setInputFiles(fixturePng)

    await expect(page.getByText("Queue")).toBeVisible({ timeout: 15_000 })
    // Extract may fail without API keys; either ready or error unlocks review.
    const reviewButton = page.getByRole("button", { name: /Done capturing — review/i })
    await expect(reviewButton).toBeEnabled({ timeout: 120_000 })
    await reviewButton.click()
    await expect(page.getByText(/Confirm|match|form|error|Retry/i).first()).toBeVisible()
    await assertNoForbiddenBrand(page)
  })
})
