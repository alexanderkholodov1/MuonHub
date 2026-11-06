"use client";

/**
 * One `DataProviderV2` per browser tab (spec 0088 FR3). It is created lazily in the browser — never
 * during the static export — and tests inject the in-memory provider through the same context.
 */
import React from "react";
import { createContext, useContext, useState, type ReactNode } from "react";
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
  const [provider] = useState<dp.DataProviderV2 | null>(() => {
    if (props.provider !== undefined) return props.provider;
    if (props.config === undefined || typeof window === "undefined") return null;
    return createBrowserProvider(props.config);
  });
  return <Context.Provider value={provider}>{props.children}</Context.Provider>;
}

/** The provider, or null while the static page has not hydrated in the browser yet. */
export function useDataProvider(): dp.DataProviderV2 | null {
  return useContext(Context);
}
