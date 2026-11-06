/**
 * Public configuration (spec 0088 FR2). Each variable is read literally so that Next.js inlines it
 * into the static export; the values are public by design (protected by the security rules).
 */
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

export const PublicConfigSchema = z.object({
  FIREBASE_API_KEY: nonEmpty,
  FIREBASE_AUTH_DOMAIN: nonEmpty,
  FIREBASE_PROJECT_ID: nonEmpty,
  FIREBASE_DATABASE_URL: z.url(),
  FIREBASE_APP_ID: nonEmpty,
  USE_EMULATORS: z.enum(["0", "1"]).default("0"),
  AUTH_GOOGLE: z.enum(["0", "1"]).default("0"),
});

export type PublicConfig = z.infer<typeof PublicConfigSchema>;

export type ConfigResult = { ok: true; config: PublicConfig } | { ok: false; missing: string[] };

/** Raw values as Next.js inlines them; `undefined` when the variable was not set at build time. */
export function readRawConfig(): Record<keyof PublicConfig, string | undefined> {
  return {
    FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_DATABASE_URL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    USE_EMULATORS: process.env.NEXT_PUBLIC_USE_EMULATORS,
    AUTH_GOOGLE: process.env.NEXT_PUBLIC_AUTH_GOOGLE,
  };
}

/** Validates once; the failure names every missing or invalid variable (`NEXT_PUBLIC_…`). */
export function parseConfig(raw: Readonly<Record<string, string | undefined>>): ConfigResult {
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = PublicConfigSchema.safeParse(cleaned);
  if (result.success) return { ok: true, config: result.data };
  const missing = [...new Set(result.error.issues.map((i) => String(i.path[0])))].map(
    (k) => `NEXT_PUBLIC_${k}`,
  );
  return { ok: false, missing };
}
