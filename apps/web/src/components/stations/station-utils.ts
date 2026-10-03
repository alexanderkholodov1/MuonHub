"use client";

import type {
  Detector,
  HardwareVersion,
  Station,
  StationPlacement,
  StationType,
  Visibility,
} from "@muonhub/shared";
import { defaultCalibration } from "@muonhub/shared";

export const VISIBILITY_OPTIONS = [
  {
    value: "public",
    label: "Public",
    description: "Visible on public network views once map features land.",
  },
  {
    value: "institution",
    label: "Institution",
    description: "Visible to institution collaborators when membership flows land.",
  },
  {
    value: "private",
    label: "Private",
    description: "Only the owner sees this station until sharing is configured.",
  },
] as const satisfies ReadonlyArray<{
  value: Visibility;
  label: string;
  description: string;
}>;

export const PLACEMENT_OPTIONS = [
  { value: "ground", label: "Ground level" },
  { value: "indoor", label: "Indoor" },
  { value: "basement", label: "Basement" },
  { value: "underground", label: "Underground" },
  { value: "outdoor", label: "Outdoor" },
  { value: "rooftop", label: "Rooftop" },
] as const satisfies ReadonlyArray<{ value: StationPlacement; label: string }>;

export const STATION_TYPE_OPTIONS = [
  {
    value: "single",
    label: "Single detector",
    description: "Primary metric: charged-particle / MIP-type rate.",
  },
  {
    value: "coincidence",
    label: "Coincidence telescope",
    description: "Two or more detectors arranged for coincidence measurements.",
  },
] as const satisfies ReadonlyArray<{
  value: StationType;
  label: string;
  description: string;
}>;

export const HARDWARE_VERSION_OPTIONS = [
  { value: "v2", label: "CosmicWatch v2" },
  { value: "v3X", label: "CosmicWatch v3X" },
  { value: "unknown", label: "Unknown / confirm later" },
] as const satisfies ReadonlyArray<{ value: HardwareVersion; label: string }>;

const OPTIONAL_STATION_FIELDS = ["floor", "shielding", "orientation", "notes"] as const;

export function missingOptionalStationMetadata(station: Station): string[] {
  const missing: string[] = [];
  for (const field of OPTIONAL_STATION_FIELDS) {
    const value = station[field];
    if (value == null || value.trim() === "") {
      missing.push(field);
    }
  }
  return missing;
}

export function hasDetectorTokenConsistencyAdvisory(detectors: Detector[], nextToken: string): boolean {
  return detectors.some((detector) => detector.deviceToken !== nextToken);
}

export function stationHasMixedDeviceTokens(detectors: Detector[]): boolean {
  if (detectors.length < 2) return false;
  const first = detectors[0];
  if (first == null) return false;
  return detectors.some((detector) => detector.deviceToken !== first.deviceToken);
}

export function generateEntityId(prefix: string): string {
  return `${prefix}_${generateTokenBody()}`;
}

export function generateDeviceToken(): string {
  return `dt_${generateTokenBody()}_${generateTokenBody().slice(0, 8)}`;
}

export function calibrationValuesForHardware(hwVersion: HardwareVersion): {
  adcSlope: string;
  adcIntercept: string;
  saturationMv: string;
  triggerAdcMin: string;
} {
  const calibration = defaultCalibration(hwVersion);
  const adcToMv = calibration.adcToMv ?? [1, 0];
  return {
    adcSlope: String(adcToMv[0]),
    adcIntercept: String(adcToMv[1]),
    saturationMv: String(calibration.saturationMv ?? ""),
    triggerAdcMin: String(calibration.triggerAdcMin ?? ""),
  };
}

function generateTokenBody(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") {
    return randomUUID().replace(/-/g, "").slice(0, 20);
  }

  const bytes = new Uint8Array(10);
  const getRandomValues = globalThis.crypto?.getRandomValues;
  if (typeof getRandomValues === "function") {
    getRandomValues.call(globalThis.crypto, bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
