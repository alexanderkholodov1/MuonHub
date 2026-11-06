import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

const valid = {
  FIREBASE_API_KEY: "public-key",
  FIREBASE_AUTH_DOMAIN: "muonhub.firebaseapp.com",
  FIREBASE_PROJECT_ID: "muonhub",
  FIREBASE_DATABASE_URL: "https://muonhub-default-rtdb.firebaseio.com",
  FIREBASE_APP_ID: "1:1:web:abc",
};

describe("parseConfig", () => {
  it("accepts a complete configuration with defaults for the switches", () => {
    const r = parseConfig(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.USE_EMULATORS).toBe("0");
      expect(r.config.AUTH_GOOGLE).toBe("0");
    }
  });

  it("names every missing or invalid variable", () => {
    const r = parseConfig({
      ...valid,
      FIREBASE_API_KEY: undefined,
      FIREBASE_DATABASE_URL: "not a url",
    });
    expect(r).toEqual({
      ok: false,
      missing: ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_DATABASE_URL"],
    });
  });

  it("treats empty strings as missing", () => {
    const r = parseConfig({ ...valid, FIREBASE_APP_ID: "" });
    expect(r).toEqual({ ok: false, missing: ["NEXT_PUBLIC_FIREBASE_APP_ID"] });
  });
});
