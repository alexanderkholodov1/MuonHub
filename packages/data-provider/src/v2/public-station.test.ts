import { describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import {
  buildPublicStation,
  buildStationAccess,
  newStreamId,
  newTransferId,
  stripUndefined,
} from "./public-station.js";
import { station } from "./fixtures.js";

const stats = { deviceCount: 2, active: true };

describe("buildPublicStation", () => {
  it.each(["exact", "approximate", "city", "country", "hidden"] as const)(
    "honours precision %s and validates against the projection schema",
    (precision) => {
      const p = buildPublicStation(station({ publicPrecision: precision }), stats, 5);
      expect(v2.PublicStationSchema.safeParse(p).success).toBe(true);
      expect(p.precision).toBe(precision);
    },
  );

  it("rounds approximate coordinates down to 0.1 degree and never exposes exact ones", () => {
    const p = buildPublicStation(station(), stats, 5);
    expect(p.point).toEqual({ lat: -0.2, lon: -78.5 });
    const json = JSON.stringify(p);
    expect(json).not.toContain("-0.1963");
    expect(json).not.toContain("altitude");
    expect(json).not.toContain("ownerUid");
  });

  it("hidden precision carries no location at all", () => {
    const p = buildPublicStation(station({ publicPrecision: "hidden" }), stats, 5);
    expect(p).not.toHaveProperty("point");
    expect(p).not.toHaveProperty("city");
    expect(p).not.toHaveProperty("countryCode");
  });
});

describe("buildStationAccess", () => {
  it("mirrors members by role and the public flag", () => {
    const a = buildStationAccess(station(), [
      { uid: "e1", role: "editor" },
      { uid: "v1", role: "viewer" },
    ]);
    expect(a).toEqual({
      ownerUid: "ownerUid1",
      public: true,
      editors: { e1: true },
      viewers: { v1: true },
    });
    expect(buildStationAccess(station({ visibility: "private" }), [])).toEqual({
      ownerUid: "ownerUid1",
      public: false,
    });
  });
});

describe("helpers", () => {
  it("strips undefined but keeps zero and false", () => {
    expect(
      stripUndefined({
        a: 0,
        b: false,
        c: undefined,
        d: { e: undefined, f: 1 },
        g: [undefined, 2],
      }),
    ).toEqual({
      a: 0,
      b: false,
      d: { f: 1 },
      g: [undefined, 2].map((x) => x),
    });
  });

  it("makes ids that satisfy the contracts", () => {
    expect(v2.TransferIdSchema.safeParse(newTransferId("station-1")).success).toBe(true);
    expect(v2.StreamIdSchema.safeParse(newStreamId("ownerUid1")).success).toBe(true);
  });
});
