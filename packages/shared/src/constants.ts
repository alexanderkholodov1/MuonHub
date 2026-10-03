/**
 * Domain constants — reconciled from v5 and shared across all packages.
 * Values are frozen to prevent accidental mutation.
 */

/** Realtime window: records older than this auto-expire (8 minutes). */
export const REALTIME_RETENTION_MS = 8 * 60 * 1000;

/** Hard cap on stored realtime records (Firebase). */
export const REALTIME_LIMIT = 5000;

/**
 * A gap of at least this long between consecutive minute points breaks the chart line.
 * Do not lower this — minute-boundary saves can arrive slightly late.
 */
export const GAP_THRESHOLD_MS = 2 * 60 * 1000;

/** Max points rendered per chart (LTTB downsampling target). */
export const MAX_CHART_POINTS = 500;

/**
 * Dead-time constant τ_DT per hardware version (seconds), used by `@muonhub/physics`.
 * v2 ≈ 50 ms, v3X ≈ 400 µs. `unknown` falls back to the conservative v2 value.
 */
export const DEAD_TIME_TAU_S = Object.freeze({
  v2: 50e-3,
  v3X: 400e-6,
  unknown: 50e-3,
});

/** Canonical minute-record field labels (English source locale). */
export const MINUTE_FIELD_LABELS = Object.freeze({
  ec: "Charged-particle rate (/min)",
  cc: "Coincidences (/min)",
  sm: "SiPM avg (mV)",
  sx: "SiPM max (mV)",
  sn: "SiPM min (mV)",
  tp: "Temperature (°C)",
  pr: "Pressure (hPa)",
  dt: "Dead time (%)",
});

/** Enum value arrays (handy for UI selects and iteration). */
export const VISIBILITIES = ["public", "institution", "private"] as const;
export const STATION_PLACEMENTS = [
  "ground",
  "indoor",
  "basement",
  "underground",
  "outdoor",
  "rooftop",
] as const;
export const STATION_TYPES = ["single", "coincidence"] as const;
export const ROLES = ["admin", "user", "guest"] as const;
export const HARDWARE_VERSIONS = ["v2", "v3X", "unknown"] as const;
export const LANGUAGES = ["en", "es", "pt-BR"] as const;
