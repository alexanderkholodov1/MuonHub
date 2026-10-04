import { consoleParserLogger, type ParseOptions, type ParserLogger } from "./types.js";

const NUMBER_TOKEN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export function getLogger(options?: ParseOptions): ParserLogger {
  return options?.logger ?? consoleParserLogger;
}

export function getNow(options?: ParseOptions): number {
  return options?.now?.() ?? Date.now();
}

export function parseFiniteNumberToken(token: string): number | null {
  const trimmed = token.trim();
  if (!NUMBER_TOKEN.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    return parseFiniteNumberToken(value);
  }

  return null;
}

export function readFirstFiniteNumber(
  source: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    if (Object.hasOwn(source, key)) {
      const value = readFiniteNumber(source[key]);
      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

export function hasRequiredNumber(value: number | null): value is number {
  return value !== null;
}

export function warnSkipped(
  options: ParseOptions | undefined,
  message: string,
  line: string,
): null {
  getLogger(options).warn(message, { line });
  return null;
}
