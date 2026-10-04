/**
 * @muonhub/shared
 *
 * Single source of truth for the MuonHub domain: Zod schemas (authored once) with TypeScript types
 * inferred from them, plus shared constants. No I/O — pure and independently testable.
 *
 * Consumers import schemas to validate and types to annotate; the two can never drift because the
 * type is `z.infer` of the schema.
 */
export const MUONHUB_VERSION = "6.0.0-alpha.1.1.1" as const;

export * from "./schemas/index.js";
export * from "./constants.js";
export * from "./calibration.js";
