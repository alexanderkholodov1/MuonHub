import type { ParseOptions, RawReading } from "./types.js";
import { getNow, parseFiniteNumberToken, warnSkipped } from "./utils.js";

export function parseCsvLine(line: string, options?: ParseOptions): RawReading | null {
  const tokens = line.split(",").map((part) => part.trim());
  if (tokens.length < 5) {
    return warnSkipped(options, "Skipped CSV serial line with insufficient columns.", line);
  }

  const eventToken = tokens[0];
  const sipmToken = tokens[1];
  const deadtimeToken = tokens[4];
  if (eventToken === undefined || sipmToken === undefined || deadtimeToken === undefined) {
    return warnSkipped(options, "Skipped partial CSV serial line.", line);
  }

  const eventCount = parseFiniteNumberToken(eventToken);
  const sipmMv = parseFiniteNumberToken(sipmToken);
  const deadtimePercent = parseFiniteNumberToken(deadtimeToken);
  if (eventCount === null || sipmMv === null || deadtimePercent === null) {
    return warnSkipped(options, "Skipped malformed CSV serial line.", line);
  }

  const tempC =
    tokens[2] === undefined || tokens[2] === "" ? null : parseFiniteNumberToken(tokens[2]);
  const pressurePa =
    tokens[3] === undefined || tokens[3] === "" ? null : parseFiniteNumberToken(tokens[3]);
  const coincident =
    tokens[5] === undefined || tokens[5] === "" ? 0 : parseFiniteNumberToken(tokens[5]);
  const timestamp =
    tokens[6] === undefined || tokens[6] === ""
      ? getNow(options)
      : parseFiniteNumberToken(tokens[6]);

  if (tempC === null || pressurePa === null || coincident === null || timestamp === null) {
    return warnSkipped(options, "Skipped malformed CSV serial line.", line);
  }

  return {
    timestamp,
    eventCount,
    sipmMv,
    tempC,
    pressurePa,
    deadtimePercent,
    coincident,
    sourceFormat: "csv",
  };
}
