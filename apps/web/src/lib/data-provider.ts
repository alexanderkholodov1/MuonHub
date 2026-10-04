"use client";

import {
  createFirebaseProvider,
  type DataProvider,
  type FirebaseClientConfig,
} from "@muonhub/data-provider";

let providerPromise: Promise<DataProvider> | null = null;

const REQUIRED_FIREBASE_ENV = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_DATABASE_URL",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
] as const;

export interface DataProviderReadyState {
  readonly status: "ready";
}

export interface DataProviderMissingConfigState {
  readonly status: "missing-config";
  readonly missing: ReadonlyArray<(typeof REQUIRED_FIREBASE_ENV)[number]>;
  readonly message: string;
}

export interface DataProviderUnsupportedState {
  readonly status: "unsupported-provider";
  readonly provider: string;
  readonly message: string;
}

export type DataProviderConfigState =
  | DataProviderReadyState
  | DataProviderMissingConfigState
  | DataProviderUnsupportedState;

export class DataProviderConfigurationError extends Error {
  readonly state: Exclude<DataProviderConfigState, DataProviderReadyState>;

  constructor(state: Exclude<DataProviderConfigState, DataProviderReadyState>) {
    super(state.message);
    this.name = "DataProviderConfigurationError";
    this.state = state;
  }
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return undefined;
  }
  return value;
}

export function getDataProviderConfigState(): DataProviderConfigState {
  const activeProvider = optionalEnv("NEXT_PUBLIC_ACTIVE_PROVIDER") ?? "firebase";
  if (activeProvider !== "firebase") {
    return {
      status: "unsupported-provider",
      provider: activeProvider,
      message: `Backend provider "${activeProvider}" is not supported by this web build.`,
    };
  }

  const missing = REQUIRED_FIREBASE_ENV.filter((name) => optionalEnv(name) == null);
  if (missing.length > 0) {
    return {
      status: "missing-config",
      missing,
      message:
        "Backend not configured. Set the NEXT_PUBLIC_FIREBASE_* variables documented in .env.example to connect the MuonHub data provider.",
    };
  }

  return { status: "ready" };
}

export function isDataProviderConfigurationError(
  error: unknown,
): error is DataProviderConfigurationError {
  return error instanceof DataProviderConfigurationError;
}

function firebaseConfigFromEnv(): FirebaseClientConfig {
  const config: FirebaseClientConfig = {
    target: "client",
    apiKey: optionalEnv("NEXT_PUBLIC_FIREBASE_API_KEY") ?? "",
    authDomain: optionalEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") ?? "",
    databaseURL: optionalEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL") ?? "",
    projectId: optionalEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ?? "",
  };

  const storageBucket = optionalEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
  if (storageBucket != null) {
    config.storageBucket = storageBucket;
  }

  const messagingSenderId = optionalEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
  if (messagingSenderId != null) {
    config.messagingSenderId = messagingSenderId;
  }

  const appId = optionalEnv("NEXT_PUBLIC_FIREBASE_APP_ID");
  if (appId != null) {
    config.appId = appId;
  }

  return config;
}

export function getDataProvider(): Promise<DataProvider> {
  if (providerPromise == null) {
    const state = getDataProviderConfigState();
    if (state.status !== "ready") {
      return Promise.reject(new DataProviderConfigurationError(state));
    }
    providerPromise = createFirebaseProvider(firebaseConfigFromEnv()).catch((error: unknown) => {
      providerPromise = null;
      throw error;
    });
  }
  return providerPromise;
}
