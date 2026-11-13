import { t } from "../src/i18n/t";
import { LIVE_SOURCE } from "../src/features/landing/live-feed";
import { test, expect, liveRequestsOf, openAsOwner, signIn } from "./fixtures";
import { STUB_DETECTORS } from "./live-source";

test("the landing shows the planet, the live detector and every munhub-lab detector, without an account", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: t("landing.hero.title"), exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(t("landing.status.live", { place: LIVE_SOURCE.place })),
  ).toBeVisible();
  // The planet is drawn (WebGL canvas) and labels the site with the detectors it holds.
  await expect(page.locator("main canvas")).toBeVisible();
  await expect(page.getByText(t("landing.globe.sublabel", { count: 3, live: 1 }))).toBeAttached();
  // munhub-lab's readout: a running count that ticks with the particles, and the last minute.
  await expect(
    page.getByText(/^particles so far in the minute from \d\d:\d\d \(Quito\)$/),
  ).toBeVisible();
  await expect(page.getByText(/^1[45]\d ± 1[12]$/).first()).toBeVisible();
  await expect(page.getByText("2.4 mV", { exact: true }).first()).toBeVisible();
  // The last hour.
  await expect(
    page.getByRole("img", {
      name: /^Charged particles per minute over the last hour: 60 minutes recorded/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(t("landing.hour.recordedValue", { count: 60 }), { exact: true }),
  ).toBeVisible();
  // Every public munhub-lab detector, duplicates merged, the private one never shown.
  const detectors = page.getByRole("region", { name: t("landing.detectors.title") });
  const cards = detectors.getByRole("list").first().getByRole("listitem");
  await expect(cards).toHaveCount(3);
  for (const name of [STUB_DETECTORS.live, STUB_DETECTORS.old, STUB_DETECTORS.duplicate]) {
    await expect(cards.filter({ hasText: name })).toHaveCount(1);
  }
  await expect(page.getByText(STUB_DETECTORS.hidden)).toHaveCount(0);
  await expect(detectors.getByText(t("landing.detectors.live"), { exact: true })).toBeVisible();
  // The live data comes first: the hero's actions lead to it, not to a sign-in.
  const hero = page.getByRole("region", { name: t("landing.hero.title") });
  await expect(hero.getByRole("link", { name: t("landing.hero.cta.lastHour") })).toBeVisible();
  await expect(hero.getByRole("link", { name: t("nav.signIn") })).toHaveCount(0);
  // Only public parts of v5 are read: never a profile's root, which carries personal fields.
  const asked = liveRequestsOf(page);
  expect(asked.length).toBeGreaterThan(0);
  for (const path of asked) {
    expect(path).toMatch(
      /^(\.json|\/[^/]+\/(realtime|visibility|name|meta\/name|latest\/ts|sessions(\/[^/]+\/minutes)?)\.json)$/,
    );
  }
});

test("the header is dark and the hero fits the first screen of a 1366 × 768 laptop", async ({
  page,
}, testInfo) => {
  // 768 px of screen leave about 650 px to the page once the browser's own bars are drawn.
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 1366, height: 650 });
  await page.goto("/");
  await expect(page.locator("header")).toHaveCSS("color", "rgb(230, 234, 242)");
  if (testInfo.project.name === "desktop") {
    const box = await page
      .getByRole("link", { name: t("landing.hero.cta.lastHour") })
      .boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(650);
  }
});

test.describe("light theme", () => {
  test.use({ colorScheme: "light" });

  test("the header and the hero stay a night sky, with the dark palette's legible text", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("header")).toHaveCSS("color", "rgb(230, 234, 242)");
    // Dark-theme secondary text (#9aa4b2) on the dark background, never the light theme's grey.
    await expect(page.getByText(t("landing.hero.lead"), { exact: true })).toHaveCSS(
      "color",
      "rgb(154, 164, 178)",
    );
    await expect(page.locator("div.surface-night").first()).toHaveCSS(
      "background-color",
      "rgb(11, 14, 20)",
    );
  });
});

test("the pages link to each other and switch to Spanish", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^ES/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { level: 1, name: "Rayos cósmicos, contados en vivo." }),
  ).toBeVisible();
  // From the landing to the network page and back, with the header's links, still in Spanish.
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Red" })
    .click();
  await expect(page).toHaveURL("/network");
  await expect(
    page.getByRole("heading", { level: 1, name: "Todos los detectores, en un planeta" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Inicio" })
    .click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.getByRole("button", { name: /^EN/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: t("landing.hero.title") }),
  ).toBeVisible();
});

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
  // The detector read through the landing's bridge is listed too, with its live state.
  const stations = page.getByRole("region", { name: t("network.stations.title") });
  await expect(stations.getByText(LIVE_SOURCE.station, { exact: true })).toBeVisible();
  await expect(stations.getByText(t("landing.network.live"), { exact: true })).toBeVisible();
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
