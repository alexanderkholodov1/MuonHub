/**
 * Built-in device types (spec 0083 FR4). Column meanings come from docs/science/SERIAL-FORMATS.md;
 * every meaning or unit not yet confirmed on real hardware output is flagged `unverified`.
 */
import type { DeviceType } from "../device-type.js";

const CREATED = Date.UTC(2026, 9, 7);
const COSMICWATCH_GEOMETRY = {
  activeAreaCm2: 25,
  thicknessCm: 1,
  material: "plastic scintillator",
};
/** 0–200 mV in 2 mV bins (101 edges). */
const MV_EDGES_0_200 = Array.from({ length: 101 }, (_, i) => i * 2);

/** CosmicWatch v2 (classic): one 10-bit ADC, no pressure. */
export const COSMICWATCH_V2: DeviceType = {
  schemaVersion: 2,
  id: "cosmicwatch-v2",
  version: 1,
  name: "CosmicWatch v2",
  status: "builtin",
  channels: 1,
  transport: { baud: 9600, lineTerminator: "CRLF", encoding: "ascii" },
  parser: {
    kind: "columns",
    separator: "whitespace",
    headerPattern: "^[A-Za-z#]",
    fields: [
      { source: 0, quantity: "eventId", unit: "count" },
      { source: 1, quantity: "deviceTime", unit: "ms" },
      { source: 2, quantity: "adc", unit: "adc" },
      { source: 3, quantity: "amplitude", unit: "mV" },
      {
        source: 4,
        quantity: "deadTime",
        unit: "ms",
        unverified: true,
        note: "cumulative per the v2 documentation; to verify on a capture",
      },
      { source: 5, quantity: "temperature", unit: "degC" },
    ],
  },
  timeSource: { kind: "deviceMs", rolloverBits: 32 },
  counterSemantics: "eventId",
  deadTimeSemantics: { kind: "cumulative", unit: "ms", unverified: true },
  defaults: {
    saturation: { value: 180, unit: "mV" },
    geometry: COSMICWATCH_GEOMETRY,
    histogramEdges: MV_EDGES_0_200,
  },
  createdAt: CREATED,
};

/** CosmicWatch v3X (official column order): one 12-bit ADC, pressure, coincidence flag, IMU. */
export const COSMICWATCH_V3X: DeviceType = {
  schemaVersion: 2,
  id: "cosmicwatch-v3x",
  version: 1,
  name: "CosmicWatch v3X",
  status: "builtin",
  channels: 1,
  transport: { baud: 9600, lineTerminator: "CRLF", encoding: "ascii" },
  parser: {
    kind: "columns",
    separator: "whitespace",
    headerPattern: "^[A-Za-z#]",
    fields: [
      { source: 0, quantity: "eventId", unit: "count" },
      { source: 1, quantity: "deviceTime", unit: "s" },
      { source: 2, quantity: "coincidenceFlag", unit: "flag" },
      { source: 3, quantity: "adc", unit: "adc" },
      { source: 4, quantity: "amplitude", unit: "mV" },
      { source: 5, quantity: "deadTime", unit: "s" },
      { source: 6, quantity: "temperature", unit: "degC" },
      { source: 7, quantity: "pressure", unit: "Pa" },
      { source: 8, quantity: "ignored", unit: "none", note: "accelerometer x" },
      { source: 9, quantity: "ignored", unit: "none", note: "accelerometer y" },
      { source: 10, quantity: "ignored", unit: "none", note: "accelerometer z" },
      { source: 11, quantity: "ignored", unit: "none", note: "gyroscope x" },
      { source: 12, quantity: "ignored", unit: "none", note: "gyroscope y" },
      { source: 13, quantity: "ignored", unit: "none", note: "gyroscope z" },
    ],
  },
  timeSource: { kind: "deviceS" },
  counterSemantics: "eventId",
  deadTimeSemantics: { kind: "cumulative", unit: "s" },
  defaults: {
    saturation: { value: 180, unit: "mV" },
    geometry: COSMICWATCH_GEOMETRY,
    histogramEdges: MV_EDGES_0_200,
  },
  createdAt: CREATED,
};

/**
 * MuNRa firmware (USFQ, CosmicWatch v3X-derived, custom column order):
 * `Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C] DeadTime[us] Coincident COSMIC`.
 * The dead-time meaning/unit, the SiPM unit, and the meaning of ADC2 are unverified until the
 * M1 step-9 capture.
 */
export const MUNRA: DeviceType = {
  schemaVersion: 2,
  id: "munra",
  version: 1,
  name: "CosmicWatch (MuNRa firmware)",
  status: "builtin",
  channels: 1,
  transport: { baud: 9600, lineTerminator: "CRLF", encoding: "ascii" },
  parser: {
    kind: "columns",
    separator: "whitespace",
    headerPattern: "^[A-Za-z#]",
    recordMarker: "COSMIC",
    fields: [
      { source: 0, quantity: "eventId", unit: "count" },
      { source: 1, quantity: "deviceTime", unit: "ms" },
      { source: 2, quantity: "adc", unit: "adc", channel: 0 },
      {
        source: 3,
        quantity: "ignored",
        unit: "adc",
        unverified: true,
        note: "ADC2: meaning unverified (second reading or baseline?)",
      },
      {
        source: 4,
        quantity: "amplitude",
        unit: "mV",
        unverified: true,
        note: "values below 1 suggest V rather than mV",
      },
      { source: 5, quantity: "pressure", unit: "Pa" },
      { source: 6, quantity: "temperature", unit: "degC" },
      {
        source: 7,
        quantity: "deadTime",
        unit: "us",
        unverified: true,
        note: "assumed cumulative µs until the capture shows the column only increases",
      },
      { source: 8, quantity: "coincidenceFlag", unit: "flag" },
    ],
  },
  timeSource: { kind: "deviceMs", rolloverBits: 32 },
  counterSemantics: "eventId",
  deadTimeSemantics: { kind: "cumulative", unit: "us", unverified: true },
  defaults: {
    geometry: COSMICWATCH_GEOMETRY,
  },
  createdAt: CREATED,
};

export const BUILTIN_DEVICE_TYPES: readonly DeviceType[] = [COSMICWATCH_V2, COSMICWATCH_V3X, MUNRA];
