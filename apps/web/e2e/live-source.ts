/**
 * A stand-in for MunHub v5 (munhub-lab's database), the landing's live source, so the suite never
 * depends on, or reads, the v5 project: every request to it is answered here with data shaped like
 * v5's, relative to the current time. Profiles: the live detector, an older public one listed under
 * two keys, and a private one that must never be shown.
 */
import type { Page } from "@playwright/test";
import { V5_PROFILES } from "../src/features/landing/live-feed";

const EVENT_SPACING_MS = 400;
const SESSION = "session_1793377005775";
const OLD_MINUTE_S = 1772597940; // 2026-03-04

export const STUB_MINUTE_COUNT = (i: number): number => 140 + ((i * 7) % 21);
export const STUB_DETECTORS = {
  live: "LEOPARD-TEST",
  old: "PLANE",
  duplicate: "HAYEK-1",
  hidden: "Private-One",
};

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
    out[String(start / 1000)] = {
      cc: 0,
      dt: 0.04,
      ec: STUB_MINUTE_COUNT(i),
      pr: 76660,
      tp: 30.9,
      sm: 2.4,
    };
  }
  return out;
}

type Profile = {
  name?: string;
  metaName?: string;
  visibility?: string;
  live?: boolean;
  old?: boolean;
};
const PROFILES: Record<string, Profile> = {
  leopard_test: {
    name: STUB_DETECTORS.live,
    metaName: STUB_DETECTORS.live,
    visibility: "public",
    live: true,
  },
  plane: {
    name: STUB_DETECTORS.old,
    metaName: STUB_DETECTORS.old,
    visibility: "public",
    old: true,
  },
  "HAYEK-1": {},
  hayek_1: { metaName: STUB_DETECTORS.duplicate, old: true },
  secret: { name: STUB_DETECTORS.hidden, visibility: "private", old: true },
};

function answer(path: string, url: URL): unknown {
  if (path === ".json") return Object.fromEntries(Object.keys(PROFILES).map((k) => [k, true]));
  const match = /^\/([^/]+)\/(.+)\.json$/.exec(path);
  if (match === null) return null;
  const [, key = "", rest = ""] = match;
  const profile = PROFILES[decodeURIComponent(key)];
  if (profile === undefined) return null;
  const now = Date.now();
  switch (rest) {
    case "visibility":
      return profile.visibility ?? null;
    case "name":
      return profile.name ?? null;
    case "meta/name":
      return profile.metaName ?? null;
    case "latest/ts":
      return profile.live === true ? now - 2_000 : null;
    case "sessions":
      return profile.live === true || profile.old === true ? { [SESSION]: true } : null;
    case `sessions/${SESSION}/minutes`:
      if (profile.live === true)
        return minutes(Number(url.searchParams.get("limitToLast") ?? "60"));
      return profile.old === true ? { [String(OLD_MINUTE_S)]: { ec: 120 } } : null;
    case "realtime": {
      if (profile.live !== true) return null;
      const startAt = url.searchParams.get("startAt");
      const last = Number(url.searchParams.get("limitToLast") ?? "0");
      return startAt !== null
        ? events(Number(JSON.parse(startAt)), now - 2_000)
        : events(now - 2_000 - (last - 1) * EVENT_SPACING_MS, now - 2_000);
    }
    default:
      return null;
  }
}

/** Answers v5; returns the list of paths (after `/profiles`) the page asked for. */
export async function stubLiveSource(page: Page): Promise<string[]> {
  const asked: string[] = [];
  const base = new URL(V5_PROFILES);
  await page.route(
    (url) => url.origin === base.origin && url.pathname.startsWith(base.pathname),
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice(base.pathname.length);
      asked.push(path);
      await route.fulfill({
        json: answer(path, url),
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );
  return asked;
}
