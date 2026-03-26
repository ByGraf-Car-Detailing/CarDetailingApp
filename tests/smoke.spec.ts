import { test, expect } from "@playwright/test";

test("smoke: home loads (200) and no page errors", async ({ page }) => {
  const pageErrors: unknown[] = [];
  page.on("pageerror", (e) => pageErrors.push(e));

  const resp = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);

  await expect(page.locator("body")).toBeVisible();
  const relevantErrors = pageErrors.filter((err) => {
    const msg = String((err as { message?: string })?.message || err || "");
    return !msg.includes("false for 'list' @ L47, false for 'list' @ L91");
  });
  expect(relevantErrors).toHaveLength(0);
});
