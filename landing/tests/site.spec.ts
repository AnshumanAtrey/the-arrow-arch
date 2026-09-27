import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("desktop story, FAQ and demo navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Aim once. Land once.", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("main>section")).toHaveCount(7);
  await page.locator("#faq").scrollIntoViewIfNeeded();
  const failure = page.getByRole("button", {
    name: "What happens when a worker fails?",
  });
  await failure.click();
  await expect(failure).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Does Arrow replace developers?" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#faq-panel-2")).toBeVisible();
  await page.locator(".header-cta").click();
  await expect(page).toHaveURL(/\/demo/);
  await expect(page.getByText("NO LIVE AGENTS RUNNING")).toBeVisible();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Next stage" }).click();
  await expect(
    page.getByRole("heading", { name: "A branch you can review." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(
    page.getByRole("heading", { name: "Make the ask testable." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile navigation, layouts and no horizontal overflow", async ({
  page,
}) => {
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Onboarding" })
      .click();
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.goto("/demo");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.getByRole("button", { name: "Stage 5: Land" }).click();
    await expect(
      page.getByRole("heading", { name: "A branch you can review." }),
    ).toBeVisible();
  }
});
test("reduced-motion content and accessibility", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/", "/demo"]) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((x) => ({
        id: x.id,
        nodes: x.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
test("all local links and assets resolve", async ({ page, request }) => {
  await page.goto("/");
  const urls = await page
    .locator("img[src], use[href], a[href]")
    .evaluateAll((els) =>
      Array.from(
        new Set(
          els
            .map(
              (el) => el.getAttribute("src") || el.getAttribute("href") || "",
            )
            .filter((x) => x.startsWith("/"))
            .map((x) => x.split("#")[0]),
        ),
      ),
    );
  for (const url of urls) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(200);
  }
  const missing = await page
    .locator('a[href^="#"]')
    .evaluateAll((els) =>
      els
        .map((e) => e.getAttribute("href")!)
        .filter((h) => !document.getElementById(h.slice(1))),
    );
  expect(missing).toEqual([]);
});

test("hero stage selection supports pointer and keyboard", async ({ page }) => {
  await page.goto("/");
  const stages = page.getByRole("tablist", {
    name: "Explore the delivery stages",
  });
  const plan = stages.getByRole("tab", { name: /Plan/ });
  await plan.click();
  await expect(plan).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Human approval required",
  );
  await plan.press("End");
  const land = stages.getByRole("tab", { name: /Land/ });
  await expect(land).toBeFocused();
  await expect(land).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("No automatic push");
  await land.press("ArrowRight");
  await expect(stages.getByRole("tab", { name: /Understand/ })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Acceptance criteria defined",
  );
});
