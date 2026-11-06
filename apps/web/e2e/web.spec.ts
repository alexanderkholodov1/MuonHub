import { t } from "../src/i18n/t";
import { test, expect, openAsOwner, signIn } from "./fixtures";

test("signed-out app redirects and sign-in returns to owned stations", async ({ page, seed }) => {
  await page.goto("/app");
  await expect(page).toHaveURL("/signin?next=%2Fapp");
  await signIn(page, seed.owner);
  await expect(page).toHaveURL("/app");
  const owned = page.getByRole("region", { name: t("nav.myStations"), exact: true });
  const row = owned.getByRole("listitem").filter({ hasText: seed.station.name });
  await expect(row.getByRole("link", { name: seed.station.name, exact: true })).toBeVisible();
  await expect(row.getByText(t("stations.role.owner"), { exact: true })).toBeVisible();
});

test("station shows its device, labelled stream and healthy members section", async ({
  page,
  seed,
}) => {
  await openAsOwner(page, seed, `/app/station?id=${seed.station.id}`);
  await expect(page.getByRole("heading", { name: seed.station.name, exact: true })).toBeVisible();
  const devices = page.locator("section").filter({
    has: page.getByRole("heading", { name: t("devices.title"), exact: true }),
  });
  await expect(devices.getByText(seed.device.label, { exact: true })).toBeVisible();
  const stream = page.getByRole("link", { name: seed.device.label, exact: true });
  await expect(stream).toBeVisible();
  await expect(stream).toHaveAttribute("href", `/app/stream?id=${seed.streamId}`);
  const members = page.getByRole("region", { name: t("station.membersTitle"), exact: true });
  await expect(members.getByText(t("station.membersEmpty"), { exact: true })).toBeVisible();
  await expect(members.getByRole("alert")).toHaveCount(0);
});

test("stream renders three charts, recorded rate, coverage and freshness", async ({
  page,
  seed,
}) => {
  // Keep the fixture fresh even when a slow CI run crosses several real minute boundaries.
  // setFixedTime changes Date only; polling, Firebase and chart timers still run normally.
  await page.clock.setFixedTime(seed.minutesEnd + 30_000);
  await openAsOwner(page, seed, `/app/stream?id=${seed.streamId}`);
  await expect(page.getByRole("heading", { name: seed.device.label, exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(3);
  for (const canvas of await page.locator("canvas").all()) await expect(canvas).toBeVisible();
  const rate = page.getByRole("figure", { name: t("dashboard.stat.rate"), exact: true });
  await expect(rate).toContainText("60.0 ± 0.6");
  await expect(rate).toContainText(t("dashboard.stat.rate.unit"));
  const coverage = page.getByRole("figure", { name: t("dashboard.stat.coverage"), exact: true });
  await expect(coverage).toContainText("12.5");
  await expect(coverage).toContainText(
    t("dashboard.stat.coverage.note", { minutes: 180, span: 1440 }),
  );
  await expect(page.getByText(t("dashboard.freshness.fresh"), { exact: true })).toBeVisible();
  await expect(page.getByText(t("dashboard.uncorrected"), { exact: true })).toBeVisible();
});

test("owner opens the new-device form with the built-in device types", async ({ page, seed }) => {
  // Regression: the device-type list was an unconstrained query the rules deny to non-admins.
  await openAsOwner(page, seed, `/app/device/new?station=${seed.station.id}`);
  await expect(page.getByLabel(t("devices.field.label"))).toBeVisible();
  const type = page.getByLabel(t("devices.field.type"));
  await expect(type.locator("option:not([disabled])")).not.toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("signed-out network lists the public station and renders the map", async ({ page, seed }) => {
  // External tiles are outside this suite. Exercise the real map/worker with a local empty style.
  await page.route("https://tiles.openfreemap.org/styles/*", async (route) => {
    await route.fulfill({
      json: { version: 8, sources: {}, layers: [] },
    });
  });
  await page.goto("/network");
  await expect(page.getByRole("link", { name: t("nav.signIn"), exact: true })).toBeVisible();
  await expect(page.getByText(seed.station.name, { exact: true })).toBeVisible();
  await expect(page.getByText(seed.privateStation.name, { exact: true })).toHaveCount(0);
  const map = page.getByRole("region", { name: t("network.mapLabel"), exact: true });
  await expect(map).toBeVisible();
  await expect(map.locator("canvas")).toBeVisible();
  // Wait for the separately served module worker as well as the canvas element.
  await expect.poll(() => page.workers().length).toBeGreaterThan(0);
});

test("another account cannot read the owner's private station", async ({ page, seed }) => {
  const path = `/app/station?id=${seed.privateStation.id}`;
  await page.goto(`/signin?next=${encodeURIComponent(path)}`);
  await signIn(page, seed.second);
  await expect(page).toHaveURL(path);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(t("error.permissionDenied"));
  await expect(page.getByText(seed.privateStation.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText(seed.privateStation.city, { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: t("station.details") })).toHaveCount(0);
});

test("reset gives the same confirmation for known and unknown email addresses", async ({
  page,
  seed,
}) => {
  const confirmations: string[] = [];
  for (const email of [seed.owner.email, seed.unknownEmail]) {
    await page.goto("/reset");
    await page.getByRole("textbox", { name: t("auth.email"), exact: true }).fill(email);
    await page.getByRole("button", { name: t("auth.sendReset"), exact: true }).click();
    const confirmation = page.getByRole("status");
    await expect(confirmation).toHaveText(t("auth.resetConfirmation"));
    confirmations.push(await confirmation.innerText());
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  }
  expect(confirmations[0]).toBe(confirmations[1]);
});
