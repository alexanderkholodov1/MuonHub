import React, { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import type * as ProviderModule from "@muonhub/data-provider";
import type { PublicConfig } from "../config";
import { DataProviderRoot, useDataProvider } from "./DataProviderContext";

vi.mock("@muonhub/data-provider", async (importOriginal) => {
  const original = await importOriginal<typeof ProviderModule>();
  return {
    ...original,
    v2: { ...original.v2, createFirebaseProviderV2: vi.fn() },
  };
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("hydrates disabled static controls and creates only one provider in StrictMode", () => {
  const provider = dp.createMemoryProviderV2();
  const createProvider = vi.mocked(dp.createFirebaseProviderV2).mockReturnValue(provider);
  const config: PublicConfig = {
    FIREBASE_API_KEY: "demo-api-key",
    FIREBASE_AUTH_DOMAIN: "demo-muonhub.firebaseapp.com",
    FIREBASE_PROJECT_ID: "demo-muonhub",
    FIREBASE_DATABASE_URL: "https://demo-muonhub-default-rtdb.firebaseio.com",
    FIREBASE_APP_ID: "1:0:web:demo",
    USE_EMULATORS: "1",
    EMULATOR_HOST: "127.0.0.1",
    AUTH_GOOGLE: "0",
  };
  function Control() {
    return <button disabled={useDataProvider() === null}>Test control</button>;
  }
  const app = (
    <StrictMode>
      <DataProviderRoot config={config}>
        <Control />
      </DataProviderRoot>
    </StrictMode>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(app);
  document.body.append(container);
  // Static rendering must not initialize the browser SDK, even in a DOM-capable test runner.
  expect(createProvider).not.toHaveBeenCalled();
  expect(container.querySelector("button")?.disabled).toBe(true);
  render(app, { container, hydrate: true });
  expect(screen.getByRole("button", { name: "Test control" })).toHaveProperty("disabled", false);
  expect(createProvider).toHaveBeenCalledTimes(1);
});
