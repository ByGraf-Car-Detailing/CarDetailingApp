import { test, expect } from "@playwright/test";

test("assets: manifest.json returns 200", async ({ request }) => {
  const res = await request.get("/manifest.json");
  expect(res.status()).toBe(200);
});
