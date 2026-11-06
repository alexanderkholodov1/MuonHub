// Records the five-minute presentation of docs/operations/DEMO.md against the demo that is being
// served (it never builds, seeds or changes anything): screenshots of each stop at 1366 px and
// 390 px, a video of the desktop walk-through, and an index.html that opens offline.
//
//   node scripts/record-demo.mjs [baseUrl] [outDir]
//
// The demo account's password is read from ~/.cache/muonhub-demo/demo.json and never printed.
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "http://100.120.140.56:8085";
const stamp = new Date().toISOString().slice(0, 16).replace(":", "");
const outDir = process.argv[3] ?? join(homedir(), ".cache/muonhub-demo/presentation", stamp);
const demo = JSON.parse(readFileSync(join(homedir(), ".cache/muonhub-demo/demo.json"), "utf8"));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(join(outDir, "video"), { recursive: true });
const stops = [];
const errors = [];

async function walk(browser, viewport, prefix, withVideo) {
  const context = await browser.newContext({
    viewport,
    ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}),
    ...(withVideo ? { recordVideo: { dir: join(outDir, "video"), size: viewport } } : {}),
  });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${prefix}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${prefix}: ${e.message}`));
  const hold = withVideo ? 3500 : 300;
  let n = 0;
  async function shot(name, caption) {
    n += 1;
    const file = `${prefix}-${String(n).padStart(2, "0")}-${name}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: true });
    if (prefix === "desktop") stops.push({ file, caption, url: page.url().replace(baseUrl, "") });
  }

  // 1. A protected page asks to sign in and remembers where it was asked for.
  await page.goto(`${baseUrl}/app`);
  await page.waitForURL(/\/signin\?next=/);
  await page.getByRole("textbox", { name: "Email", exact: true }).waitFor();
  await pause(hold);
  await shot("signin", "Opening /app signed out: MuonHub asks to sign in and will return to /app.");

  // 2. Sign in with the demo account: the home lists the owned station.
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .pressSequentially(demo.ownerEmail, {
      delay: withVideo ? 40 : 0,
    });
  await page.getByLabel("Password", { exact: true }).fill(demo.ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${baseUrl}/app`);
  const stationLink = page.getByRole("link", { name: /LEOPARD/ }).first();
  await stationLink.waitFor();
  await pause(hold);
  await shot("home", "Signed in: “My stations” lists LEOPARD Lab — USFQ with the owner role.");

  // 3. The station: visibility, precision, device geometry, stream, members.
  await stationLink.click();
  await page.waitForURL(/\/app\/station\?id=/);
  const streamLink = page.locator('a[href^="/app/stream?id="]').first();
  await streamLink.waitFor();
  await pause(hold);
  await shot(
    "station",
    "The station: visibility, public location precision, the device and its geometry, the stream, members.",
  );

  // 4. The stream: the detector running now at the lab, minute by minute.
  await streamLink.click();
  await page.waitForURL(/\/app\/stream\?id=/);
  await page.getByText("Up to date", { exact: true }).waitFor({ timeout: 60_000 });
  await page.locator("canvas").nth(2).waitFor();
  await pause(hold);
  const lastMinute = (
    (await page
      .getByText(/Last minute:/)
      .first()
      .textContent()) ?? ""
  ).replace(/^[^L]*/, "");
  await shot(
    "stream-24h",
    `The stream, 24 h: rate with its Poisson uncertainty, coverage, pressure and temperature; “Up to date”. ${lastMinute}.`,
  );
  for (const range of ["6 h", "72 h"]) {
    await page.getByRole("button", { name: range, exact: true }).click();
    await page.getByRole("button", { name: range, exact: true, pressed: true }).waitFor();
    await pause(hold);
    await shot(`stream-${range.replace(" ", "")}`, `The same stream over ${range}.`);
  }

  // 5. The honest labels, scrolled into view for the video.
  await page
    .getByText(/not corrected for dead time/i)
    .first()
    .scrollIntoViewIfNeeded();
  await pause(hold);

  // 6. The public network map, signed out.
  await page.locator("summary").filter({ hasText: "Account" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("link", { name: "Sign in", exact: true }).first().waitFor();
  await page.goto(`${baseUrl}/network`);
  await page.locator("canvas.maplibregl-canvas").waitFor();
  await pause(withVideo ? 5000 : 3000);
  await shot(
    "network",
    "Signed out, /network: the public stations at the precision each owner chose.",
  );

  await context.close();
  return lastMinute;
}

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const lastMinute = await walk(browser, { width: 1366, height: 900 }, "desktop", true);
await walk(browser, { width: 390, height: 844 }, "phone", false);
await browser.close();

const recorded = readdirSync(join(outDir, "video")).filter((f) => f.endsWith(".webm"));
if (recorded.length === 1)
  renameSync(join(outDir, "video", recorded[0]), join(outDir, "video", "walkthrough.webm"));

const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const figures = stops
  .map(
    (s) =>
      `<figure><img src="${s.file}" alt="${s.caption}" loading="lazy"><figcaption><b>${s.url}</b> — ${s.caption}<br><a href="${s.file.replace("desktop", "phone")}">Phone (390 px)</a></figcaption></figure>`,
  )
  .join("\n");
writeFileSync(
  join(outDir, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MuonHub demo recording</title>
<style>body{background:#0b0f14;color:#e6edf3;font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1400px;padding:16px}
img,video{max-width:100%;border:1px solid #30363d;border-radius:8px}figure{margin:32px 0}a{color:#7cc4ff}</style>
<h1>MuonHub v6 demo — recorded ${when}</h1>
<p>Recorded from the demo as served on Beacon (${baseUrl}), with the detector running at the LEOPARD lab, mirrored read-only from v5. Nothing was staged: the script only opens pages and clicks. ${lastMinute}.</p>
<p>Console errors during the recording: ${errors.length === 0 ? "none" : errors.length}.</p>
<h2>Walk-through video (desktop, 1366 px)</h2>
<video controls src="video/walkthrough.webm"></video>
<h2>Stops</h2>
${figures}
</html>
`,
);
writeFileSync(join(outDir, "errors.txt"), errors.join("\n") + "\n");
console.log(
  JSON.stringify({ outDir, lastMinute, stops: stops.length, consoleErrors: errors.length }),
);
