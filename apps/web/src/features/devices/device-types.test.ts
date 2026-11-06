import { describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import { withBuiltInTypes } from "./NewDeviceForm";

describe("withBuiltInTypes", () => {
  it("offers the built-in types when the catalogue is empty", () => {
    const keys = withBuiltInTypes([]).map((d) => `${d.id}:${String(d.version)}`);
    expect(keys).toEqual(v2.BUILTIN_DEVICE_TYPES.map((d) => `${d.id}:${String(d.version)}`));
  });

  it("adds published types and lets a published copy replace a built-in of the same version", () => {
    const munra = v2.BUILTIN_DEVICE_TYPES.find((d) => d.id === "munra");
    if (munra === undefined) throw new Error("no built-in munra");
    const published = { ...munra, name: "MuNRa (catalogue copy)" };
    const out = withBuiltInTypes([published]);
    expect(out).toHaveLength(v2.BUILTIN_DEVICE_TYPES.length);
    expect(out.find((d) => d.id === "munra")?.name).toBe("MuNRa (catalogue copy)");
  });
});
