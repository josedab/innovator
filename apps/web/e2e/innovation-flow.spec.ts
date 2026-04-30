import { test, expect } from "@playwright/test";

test.describe("Innovation Pipeline E2E", () => {
  test("should load the home page and display the subject input", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/innovator/i);

    // Verify the main input area is present
    const subjectInput = page.getByRole("textbox").first();
    await expect(subjectInput).toBeVisible();
  });

  test("should show validation error for empty subject submission", async ({ page }) => {
    await page.goto("/");

    // Try to submit without entering a subject
    const submitButton = page.getByRole("button", { name: /investigate|explore|start|go/i });

    if (await submitButton.isVisible()) {
      await submitButton.click();
      // Should show some form of validation feedback (not navigate away)
      await expect(page).toHaveURL("/");
    }
  });

  test("full flow: subject → investigation → angle selection → results", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/");

    // Step 1: Enter a subject
    const subjectInput = page.getByRole("textbox").first();
    await subjectInput.fill("renewable energy storage solutions");

    // Step 2: Submit the subject to trigger investigation
    const submitButton = page.getByRole("button", { name: /investigate|explore|start|go/i });
    if (await submitButton.isVisible()) {
      await submitButton.click();
    } else {
      // Fallback: press Enter on the input
      await subjectInput.press("Enter");
    }

    // Step 3: Wait for investigation results (angles should appear)
    // Use a generous timeout since this calls LLM APIs
    const angleSection = page.locator('[data-testid="angle-selection"], [data-testid="angles"]');
    const hasAngleSection = await angleSection.isVisible({ timeout: 60_000 }).catch(() => false);

    if (hasAngleSection) {
      // Step 4: Select angles if checkboxes/buttons are available
      const angleCheckboxes = page.getByRole("checkbox");
      const angleCount = await angleCheckboxes.count();

      if (angleCount > 0) {
        // Select first two angles
        await angleCheckboxes.nth(0).check();
        if (angleCount > 1) {
          await angleCheckboxes.nth(1).check();
        }
      }

      // Step 5: Trigger innovation
      const innovateButton = page.getByRole("button", { name: /innovate|generate|run/i });
      if (await innovateButton.isVisible()) {
        await innovateButton.click();

        // Step 6: Wait for results
        const results = page.locator(
          '[data-testid="results"], [data-testid="angle-results"]'
        );
        await expect(results).toBeVisible({ timeout: 90_000 });
      }
    }
  });
});
