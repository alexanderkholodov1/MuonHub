import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DataProviderConfigurationError,
  getDataProvider,
  getDataProviderConfigState,
} from "./data-provider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("web data provider configuration", () => {
  it("reports missing Firebase config without constructing a provider", async () => {
    vi.stubEnv("NEXT_PUBLIC_ACTIVE_PROVIDER", "firebase");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");

    const state = getDataProviderConfigState();

    expect(state.status).toBe("missing-config");
    if (state.status === "missing-config") {
      expect(state.missing).toContain("NEXT_PUBLIC_FIREBASE_API_KEY");
      expect(state.message).toContain("Backend not configured");
    }
    await expect(getDataProvider()).rejects.toBeInstanceOf(DataProviderConfigurationError);
  });

  it("reports unsupported providers as a known configuration state", () => {
    vi.stubEnv("NEXT_PUBLIC_ACTIVE_PROVIDER", "supabase");

    const state = getDataProviderConfigState();

    expect(state.status).toBe("unsupported-provider");
    if (state.status === "unsupported-provider") {
      expect(state.provider).toBe("supabase");
    }
  });
});
