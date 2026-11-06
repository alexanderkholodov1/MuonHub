"use client";

/**
 * One `DataProviderV2` per browser tab (spec 0088 FR3). It is created lazily in the browser — never
 * during the static export — and tests inject the in-memory provider through the same context.
 */
import React from "react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { v2 as dp } from "@muonhub/data-provider";
import type { PublicConfig } from "@/lib/config";

const Context = createContext<dp.DataProviderV2 | null>(null);

export function createBrowserProvider(config: PublicConfig): dp.DataProviderV2 {
  return dp.createFirebaseProviderV2({
    apiKey: config.FIREBASE_API_KEY,
    authDomain: config.FIREBASE_AUTH_DOMAIN,
    projectId: config.FIREBASE_PROJECT_ID,
    databaseURL: config.FIREBASE_DATABASE_URL,
    appId: config.FIREBASE_APP_ID,
    ...(config.USE_EMULATORS === "1"
      ? {
          emulators: {
            auth: `http://${config.EMULATOR_HOST}:9099`,
            firestore: { host: config.EMULATOR_HOST, port: 8080 },
            database: { host: config.EMULATOR_HOST, port: 9000 },
          },
        }
      : {}),
  });
}

export function DataProviderRoot(props: {
  children: ReactNode;
  /** A ready provider (tests), or the configuration to create the browser provider from. */
  provider?: dp.DataProviderV2;
  config?: PublicConfig;
}): ReactNode {
  const [provider, setProvider] = useState<dp.DataProviderV2 | null>(props.provider ?? null);
  const browserProvider = useRef<dp.DataProviderV2 | null>(null);
  useEffect(() => {
    if (props.provider !== undefined || props.config === undefined) return;
    // Match the static export on the first browser render. Creating the provider during hydration
    // leaves server-rendered disabled attributes in place (notably on the password reset form).
    // Keep the instance through StrictMode's effect replay: one provider per mounted root.
    browserProvider.current ??= createBrowserProvider(props.config);
    setProvider(browserProvider.current);
  }, [props.provider, props.config]);
  return <Context.Provider value={provider}>{props.children}</Context.Provider>;
}

/** The provider, or null while the static page has not hydrated in the browser yet. */
export function useDataProvider(): dp.DataProviderV2 | null {
  return useContext(Context);
}
