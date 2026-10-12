/**
 * Malformed-line injection (spec 0086 FR7). Gaps and resets are handled by the scenario
 * simulation (sessions); this module damages already rendered lines exactly as configured.
 */
import type { MalformedKind } from "./config.js";

export interface RenderedLine {
  /** Line text without terminator. */
  readonly text: string;
  readonly hostMs: number;
}

const encoder = new TextEncoder();

export function terminatorBytes(kind: "LF" | "CRLF"): Uint8Array {
  return encoder.encode(kind === "CRLF" ? "\r\n" : "\n");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface BytesLine {
  readonly bytes: Uint8Array;
  readonly hostMs: number;
}

/**
 * Encode data lines, applying the malformed cases at the given data-line indices
 * (`malformed` maps index → kind). Header lines are passed with `data: false` and never damaged.
 */
export function encodeLines(
  lines: readonly (RenderedLine & { readonly data: boolean })[],
  terminator: "LF" | "CRLF",
  malformed: ReadonlyMap<number, MalformedKind>,
): BytesLine[] {
  const term = terminatorBytes(terminator);
  const otherTerm = terminatorBytes(terminator === "CRLF" ? "LF" : "CRLF");
  const out: BytesLine[] = [];
  let dataIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (!line.data) {
      out.push({ bytes: concat(encoder.encode(line.text), term), hostMs: line.hostMs });
      continue;
    }
    const kind = malformed.get(dataIndex);
    dataIndex++;
    const body = encoder.encode(line.text);
    switch (kind) {
      case "truncated":
        out.push({ bytes: concat(body.subarray(0, Math.floor(body.length / 2)), term), hostMs: line.hostMs });
        break;
      case "otherTerminator":
        out.push({ bytes: concat(body, otherTerm), hostMs: line.hostMs });
        break;
      case "invalidUtf8": {
        const cut = Math.min(3, body.length);
        out.push({
          bytes: concat(body.subarray(0, cut), Uint8Array.of(0xff), body.subarray(cut), term),
          hostMs: line.hostMs,
        });
        break;
      }
      case "concatenated": {
        const next = lines[i + 1];
        if (next?.data) {
          // The next data line is glued directly after this one: "...COSMIC488 ...".
          out.push({
            bytes: concat(body, encoder.encode(next.text), term),
            hostMs: next.hostMs,
          });
          dataIndex++;
          i++;
        } else {
          out.push({ bytes: concat(body, term), hostMs: line.hostMs });
        }
        break;
      }
      default:
        out.push({ bytes: concat(body, term), hostMs: line.hostMs });
    }
  }
  return out;
}

/** Split a line into fragments of at most `size` bytes (serial ports deliver fragments). */
export function fragment(bytes: Uint8Array, size: number | undefined): Uint8Array[] {
  if (size === undefined || bytes.length <= size) return [bytes];
  const parts: Uint8Array[] = [];
  for (let o = 0; o < bytes.length; o += size) parts.push(bytes.subarray(o, o + size));
  return parts;
}
