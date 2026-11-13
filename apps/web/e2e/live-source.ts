/**
 * A stand-in for the landing's live source (src/features/landing/live-feed.ts) so the suite never
 * depends on, or reads, the v5 project: every request to it is answered here with data shaped like
 * the detector's, relative to the current time.
 */
import type { Page } from "@playwright/test";
import { LIVE_SOURCE } from "../src/features/landing/live-feed";

const EVENT_SPACING_MS = 400;
const SESSION = "session_1793377005775";

export const STUB_MINUTE_COUNT = (i: number): number => 140 + ((i * 7) % 21);

function events(fromTs: number, toTs: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const first = Math.ceil(fromTs / EVENT_SPACING_MS) * EVENT_SPACING_MS;
  for (let ts = first; ts <= toTs; ts += EVENT_SPACING_MS) {
    out[String(ts)] = { coincident: 0, deadtime: 0.04, pressure: 76660, sipm: 0.8, temp: 30.9, ts };
  }
  return out;
}

function minutes(count: number): Record<string, unknown> {
  const lastStart = Math.floor(Date.now() / 60_000) * 60_000 - 60_000;
  const out: Record<string, unknown> = {};
  for (let i = 0; i < count; i++) {
    const start = lastStart - (count - 1 - i) * 60_000;
    out[String(start / 1000)] = { cc: 0, dt: 0.04, ec: STUB_MINUTE_COUNT(i), pr: 76660, tp: 30.9 };
  }
  return out;
}

/** Answers the live source; returns the list of paths the page asked for. */
export async function stubLiveSource(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route(`${LIVE_SOURCE.base}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(new URL(LIVE_SOURCE.base).pathname.length);
    asked.push(path);
    const now = Date.now();
    const quote = (name: string): number | null => {
      const value = url.searchParams.get(name);
      return value === null ? null : Number(JSON.parse(value));
    };
    let body: unknown = null;
    if (path === "/realtime.json") {
      const startAt = quote("startAt");
      const last = Number(url.searchParams.get("limitToLast") ?? "0");
      body =
        startAt !== null
          ? events(startAt, now - 2_000)
          : events(now - 2_000 - (last - 1) * EVENT_SPACING_MS, now - 2_000);
    } else if (path === "/sessions.json") {
      body = { [SESSION]: true };
    } else if (path === `/sessions/${SESSION}/minutes.json`) {
      body = minutes(Number(url.searchParams.get("limitToLast") ?? "60"));
    }
    await route.fulfill({ json: body, headers: { "access-control-allow-origin": "*" } });
  });
  return asked;
}
