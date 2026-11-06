import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { t } from "../src/i18n/t";
import { test, expect, openAsOwner } from "./fixtures";

// WCAG 2.2 A and AA, plus axe's best practices (landmarks, one h1 per page, region labels).
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectAccessible(page: Page, where: string): Promise<void> {
  // A page still loading is not the page under test.
  await expect(page.getByText(t("state.loading"), { exact: true })).toHaveCount(0);
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const found = result.violations.map(
    (v) => `${v.id} (${v.impact ?? "?"}) at ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(found, `axe violations on ${where}`).toEqual([]);
}

async function stubTiles(page: Page): Promise<void> {
  // External tiles are outside this suite (as in web.spec.ts).
  await page.route("https://tiles.openfreemap.org/styles/*", async (route) => {
    await route.fulfill({ json: { version: 8, sources: {}, layers: [] } });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("public pages have no axe violations", async ({ page, seed }) => {
      test.setTimeout(90_000);
      await stubTiles(page);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(page, "/");
      for (const path of ["/signin", "/signup", "/reset"]) {
        await page.goto(path);
        await expect(
          page.getByRole("textbox", { name: t("auth.email"), exact: true }),
        ).toBeVisible();
        await expectAccessible(page, path);
      }
      await page.goto("/network");
      await expect(page.getByText(seed.station.name, { exact: true })).toBeVisible();
      await expect(page.locator("canvas")).toBeVisible();
      await expectAccessible(page, "/network");
    });

    test("signed-in pages have no axe violations", async ({ page, seed }) => {
      test.setTimeout(90_000);
      await page.clock.setFixedTime(seed.minutesEnd + 30_000);
      await openAsOwner(page, seed, "/app");
      await expect(page.getByRole("link", { name: seed.station.name, exact: true })).toBeVisible();
      await expectAccessible(page, "/app");

      await page.goto(`/app/station?id=${seed.station.id}`);
      await expect(
        page.getByRole("heading", { name: seed.station.name, exact: true }),
      ).toBeVisible();
      await expectAccessible(page, "/app/station");

      await page.goto(`/app/stream?id=${seed.streamId}`);
      await expect(page.locator("canvas")).toHaveCount(3);
      await expect(page.getByText(t("dashboard.freshness.fresh"), { exact: true })).toBeVisible();
      await expectAccessible(page, "/app/stream");

      await page.goto(`/app/device/new?station=${seed.station.id}`);
      await expect(page.getByLabel(t("devices.field.label"))).toBeVisible();
      await expectAccessible(page, "/app/device/new");

      await page.goto(`/app/stream/new?station=${seed.station.id}`);
      await expect(page.getByRole("heading", { name: t("streams.newTitle") })).toBeVisible();
      await expectAccessible(page, "/app/stream/new");

      await page.goto("/app/station/new");
      await expect(page.getByRole("heading", { name: t("station.newTitle") })).toBeVisible();
      await expectAccessible(page, "/app/station/new");
    });
  });
}

test("keyboard alone: skip link, sign in, then the stream's controls", async ({
  page,
  seed,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "a phone has no hardware keyboard");
  await page.clock.setFixedTime(seed.minutesEnd + 30_000);
  const path = `/app/stream?id=${seed.streamId}`;
  await page.goto(`/signin?next=${encodeURIComponent(path)}`);
  await expect(page.getByRole("textbox", { name: t("auth.email"), exact: true })).toBeVisible();

  // The first Tab reaches the skip link, which jumps past the header to the form.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: t("nav.skipToContent"), exact: true });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: t("auth.email"), exact: true })).toBeFocused();
  await page.keyboard.type(seed.owner.email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(t("auth.password"), { exact: true })).toBeFocused();
  await page.keyboard.type(seed.owner.password);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(path);

  // Range buttons work from the keyboard and show a visible focus ring.
  const sixHours = page.getByRole("button", { name: t("dashboard.range.6h"), exact: true });
  await expect(sixHours).toHaveAttribute("aria-pressed", "false");
  await sixHours.focus();
  await page.keyboard.press("Space");
  await expect(sixHours).toHaveAttribute("aria-pressed", "true");
  const ring = await sixHours.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(ring).toEqual({ style: "solid", width: "2px" });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("transitions and animations stop when the visitor asks for less motion", async ({
    page,
  }) => {
    await page.goto("/signin");
    const submit = page.getByRole("button", { name: t("nav.signIn"), exact: true });
    await expect(submit).toBeVisible();
    const seconds = await submit.evaluate((el) =>
      Math.max(
        ...getComputedStyle(el)
          .transitionDuration.split(",")
          .map((s) => parseFloat(s)),
      ),
    );
    expect(seconds).toBeLessThanOrEqual(0.001);
  });
});

test.describe("theme before hydration", () => {
  test.use({ colorScheme: "light" });

  test("a light-theme visitor gets the light theme before the app's JavaScript runs", async ({
    page,
  }) => {
    // Serve the app's bundles empty: only the inline script in the document head can set the theme.
    await page.route("**/_next/static/**/*.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    );
    await page.goto("/signin");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
