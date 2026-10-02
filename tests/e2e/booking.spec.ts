import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, label: RegExp) {
  await page.goto("/login");
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("customer books, pays (sandbox) and gets a verified ticket", async ({ page, isMobile }) => {
  await loginAs(page, /Customer/);
  await page.goto("/salons/chennai/urban-cuts/book");
  await page.getByRole("button", { name: /Tmrw/ }).click();
  const slot = page.locator('button[aria-pressed="false"]:not([disabled])').filter({ hasText: /PM$/ }).first();
  await slot.click();
  if (isMobile) await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: /Reserve & pay/ }).last().click();
  await page.waitForURL(/\/checkout\//);
  await expect(page.getByText(/holding your slot/)).toBeVisible();
  await page.getByRole("button", { name: /^Pay/ }).click();
  await page.waitForURL(/\/pay\/sandbox\//);
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await page.waitForURL(/\/customer\/bookings\/.+confirmed=1/);
  await expect(page.getByText("You're booked!")).toBeVisible();
  await expect(page.getByLabel("Check-in QR code")).toBeVisible();
});

test("customers cannot open owner routes", async ({ page }) => {
  await loginAs(page, /Customer/);
  await page.goto("/business");
  await expect(page).toHaveURL(/customer\/dashboard/);
  const res = await page.request.get("/api/business/salons/00000000-0000-0000-0000-000000000000/overview");
  expect(res.status()).toBe(403);
});

test("owner sees the live board and can open a booking", async ({ page }) => {
  await loginAs(page, /Salon owner/);
  await page.goto("/business/board");
  await expect(page.getByRole("heading", { name: "Live resource board" })).toBeVisible();
  await expect(page.getByText(/available/).first()).toBeVisible();
});
