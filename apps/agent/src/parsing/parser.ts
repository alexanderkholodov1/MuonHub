/**
 * Device-type-driven line parser (spec 0087 FR5). Reads the declarative `v2.DeviceType`; nothing is
 * hard-coded per hardware. Header and comment lines are recognised, not counted as malformed.
 * A line that cannot be parsed is `malformed` — it stays in the raw layer and is never an event;
 * an absent or unusable quantity is `undefined`, never 0 (ADR-006).
 */
import type { v2 } from "@muonhub/shared";

export interface ParsedEvent {
  /** Cumulative event counter printed by the device. */
  eventId?: number;
  /** Device clock, milliseconds. */
  deviceTimeMs?: number;
  adc?: number;
  amplitude?: { value: number; unit: v2.AmplitudeUnit };
  temperatureC?: number;
  pressureHpa?: number;
  /** Dead-time reading in microseconds (cumulative or per event, see the device type). */
  deadTimeUs?: number;
  /** Dead fraction in percent when the device reports one. */
  deadPercent?: number;
  coincidence?: boolean;
}

export type ParseResult =
  | { kind: "event"; event: ParsedEvent }
  | { kind: "header" }
  | { kind: "malformed"; reason: string };

export interface LineParser {
  parse(text: string): ParseResult;
}

const SEPARATORS: Record<string, RegExp> = {
  whitespace: /[\t ]+/,
  tab: /\t/,
  comma: /,/,
  semicolon: /;/,
};

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function toNumber(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const t = token.trim();
  if (!NUMBER.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const TO_MS: Partial<Record<v2.FieldMapping["unit"], number>> = { ms: 1, s: 1000, us: 0.001 };
const TO_US: Partial<Record<v2.FieldMapping["unit"], number>> = { us: 1, ms: 1000, s: 1_000_000 };

export function createParser(deviceType: v2.DeviceType): LineParser {
  const { parser } = deviceType;
  const header = parser.headerPattern === undefined ? null : new RegExp(parser.headerPattern);
  const sep = SEPARATORS[parser.separator ?? "whitespace"] ?? SEPARATORS["whitespace"]!;
  const mappings = parser.fields.filter((f) => f.quantity !== "ignored");
  const columnCount =
    parser.kind === "columns"
      ? Math.max(...parser.fields.map((f) => (typeof f.source === "number" ? f.source + 1 : 0)))
      : 0;

  const assign = (event: ParsedEvent, f: v2.FieldMapping, value: number): void => {
    switch (f.quantity) {
      case "eventId":
        if (Number.isInteger(value) && value >= 0) event.eventId = value;
        break;
      case "deviceTime": {
        const k = TO_MS[f.unit];
        if (k !== undefined) event.deviceTimeMs = value * k;
        break;
      }
      case "adc":
        if ((f.channel ?? 0) === 0) event.adc = value;
        break;
      case "amplitude":
        if ((f.channel ?? 0) === 0 && (f.unit === "mV" || f.unit === "V" || f.unit === "adc")) {
          event.amplitude ??= { value, unit: f.unit };
        }
        break;
      case "temperature":
        if (f.unit === "degC") event.temperatureC = value;
        break;
      case "pressure":
        if (f.unit === "Pa") event.pressureHpa = value / 100;
        else if (f.unit === "hPa") event.pressureHpa = value;
        break;
      case "deadTime":
        if (f.unit === "percent") event.deadPercent = value;
        else {
          const k = TO_US[f.unit];
          if (k !== undefined) event.deadTimeUs = value * k;
        }
        break;
      case "coincidenceFlag":
        event.coincidence = value !== 0;
        break;
      default:
        break;
    }
  };

  const finish = (event: ParsedEvent): ParseResult => {
    const hasData = Object.keys(event).length > 0;
    return hasData ? { kind: "event", event } : { kind: "malformed", reason: "no usable field" };
  };

  return {
    parse(raw) {
      const text = raw.trim();
      if (text.length === 0) return { kind: "malformed", reason: "empty line" };
      if (text.startsWith("#")) return { kind: "header" };
      if (header !== null && header.test(text)) return { kind: "header" };
      const event: ParsedEvent = {};
      if (parser.kind === "columns") {
        const tokens = text.split(sep).filter((t) => t.length > 0);
        if (tokens.length < columnCount) {
          return {
            kind: "malformed",
            reason: `expected at least ${columnCount} columns, got ${tokens.length}`,
          };
        }
        for (const f of mappings) {
          if (typeof f.source !== "number") continue;
          const value = toNumber(tokens[f.source]);
          if (value === undefined) {
            return { kind: "malformed", reason: `column ${f.source} is not a number` };
          }
          assign(event, f, value);
        }
        return finish(event);
      }
      if (parser.kind === "json") {
        let obj: unknown;
        try {
          obj = JSON.parse(text);
        } catch {
          return { kind: "malformed", reason: "not valid JSON" };
        }
        if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
          return { kind: "malformed", reason: "JSON line is not an object" };
        }
        for (const f of mappings) {
          const v = (obj as Record<string, unknown>)[String(f.source)];
          if (v === undefined) continue;
          if (typeof v !== "number" || !Number.isFinite(v)) {
            return { kind: "malformed", reason: `field ${String(f.source)} is not a number` };
          }
          assign(event, f, v);
        }
        return finish(event);
      }
      // keyValue: "KEY value KEY value ..."
      const tokens = text.split(/[\t ]+/);
      const map = new Map<string, string>();
      for (let i = 0; i + 1 < tokens.length; i += 2) map.set(tokens[i] ?? "", tokens[i + 1] ?? "");
      for (const f of mappings) {
        const token = map.get(String(f.source));
        if (token === undefined) continue;
        const value = toNumber(token);
        if (value === undefined) {
          return { kind: "malformed", reason: `value of ${String(f.source)} is not a number` };
        }
        assign(event, f, value);
      }
      return finish(event);
    },
  };
}

/** Looks up a built-in device type by id. */
export function builtinDeviceType(id: string, all: readonly v2.DeviceType[]): v2.DeviceType {
  const found = all.find((t) => t.id === id);
  if (found === undefined) {
    throw new Error(`unknown device type "${id}" (built-in: ${all.map((t) => t.id).join(", ")})`);
  }
  return found;
}
