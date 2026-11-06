import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "../lib/theme-init";

function run(stored: string | null | Error, prefersLight: boolean): string | null {
  let theme: string | null = null;
  const localStorage = {
    getItem: (key: string) => {
      if (stored instanceof Error) throw stored;
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const window = { matchMedia: () => ({ matches: prefersLight }) };
  const document = {
    documentElement: { setAttribute: (_name: string, value: string) => (theme = value) },
  };
  // The parameters stand in for the browser globals the inline script reads.
  new Function("localStorage", "window", "document", THEME_INIT_SCRIPT)(
    localStorage,
    window,
    document,
  );
  return theme;
}

describe("THEME_INIT_SCRIPT", () => {
  it("prefers the stored choice, then the system preference, then dark", () => {
    expect(run("dark", true)).toBe("dark");
    expect(run("light", false)).toBe("light");
    expect(run(null, true)).toBe("light");
    expect(run(null, false)).toBe("dark");
    expect(run("purple", true)).toBe("light");
  });

  it("falls back to the system preference when storage is unavailable", () => {
    expect(run(new Error("private mode"), true)).toBe("light");
  });
});
