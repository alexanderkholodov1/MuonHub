import { describe, expect, it } from "vitest";
import type { v2 } from "@muonhub/shared";
import { placeText, toFeatures } from "./geojson";

const base = {
  schemaVersion: 2 as const,
  name: "Lab",
  deviceCount: 1,
  active: true,
  updatedAt: Date.UTC(2026, 10, 6),
};
const exact: v2.PublicStation = {
  ...base,
  id: "exactStation0000000001",
  precision: "exact",
  point: { lat: -0.19, lon: -78.43 },
  city: "Quito",
  countryCode: "EC",
};
const approximate: v2.PublicStation = {
  ...exact,
  id: "approxStation000000001",
  precision: "approximate",
  point: { lat: -0.2, lon: -78.5 },
};
const city: v2.PublicStation = {
  ...base,
  id: "cityStation00000000001",
  precision: "city",
  city: "Quito",
  countryCode: "EC",
};
const country: v2.PublicStation = {
  ...base,
  id: "countryStation0000001",
  precision: "country",
  countryCode: "EC",
};
const hidden: v2.PublicStation = { ...base, id: "hiddenStation00000001", precision: "hidden" };

describe("toFeatures", () => {
  it("maps only stations with a point, as [lon, lat]", () => {
    const fc = toFeatures([exact, approximate, city, country, hidden]);
    expect(fc.features.map((f) => f.properties.id)).toEqual([exact.id, approximate.id]);
    expect(fc.features[0]?.geometry.coordinates).toEqual([-78.43, -0.19]);
    expect(fc.features[1]?.properties.approximate).toBe(true);
  });

  it("carries only projection fields", () => {
    const props = toFeatures([exact]).features[0]?.properties;
    expect(Object.keys(props ?? {}).sort()).toEqual(
      ["active", "approximate", "deviceCount", "id", "name", "place"].sort(),
    );
  });
});

describe("placeText", () => {
  it("follows the precision the owner chose", () => {
    expect(placeText(city)).toBe("Quito, EC");
    expect(placeText(country)).toBe("EC");
    expect(placeText(hidden)).toBeNull();
  });
});
