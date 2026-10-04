/**
 * Tests for the cn() utility.
 * Verifies that Tailwind class merging works correctly.
 */
import { describe, it, expect } from "vitest";
import { cn } from "../lib/cn";

describe("cn()", () => {
  it("returns a single class unchanged", () => {
    expect(cn("bg-surface")).toBe("bg-surface");
  });

  it("merges multiple classes", () => {
    expect(cn("text-sm", "font-medium")).toBe("text-sm font-medium");
  });

  it("deduplicates conflicting Tailwind classes (last wins)", () => {
    // tailwind-merge resolves: bg-red-500 + bg-blue-500 → bg-blue-500
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("handles falsy values gracefully", () => {
    expect(cn("text-base", false, null, undefined, "font-mono")).toBe("text-base font-mono");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn("base-class", isActive && "active", isDisabled && "disabled")).toBe(
      "base-class active",
    );
  });
});
