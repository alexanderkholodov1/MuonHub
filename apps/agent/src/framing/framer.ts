/**
 * Bytes → lines (spec 0087 FR3). Tolerates CRLF, LF and CR terminators, fragments split across
 * reads (down to one byte), invalid UTF-8 (lossy decode; the original bytes are kept), and
 * concatenated records, split exactly as v5 does (`COSMIC` followed by a digit starts a new record).
 * Pure: no I/O, no clock — the caller stamps the chunk.
 */
import { RAW_FLAG_LOSSY, RAW_FLAG_SPLIT, RAW_FLAG_TRUNCATED } from "../store/types.js";

/** Longest line kept as text (spec 0083 raw-line contract). Longer input is truncated, bytes kept. */
export const MAX_LINE_CHARS = 4096;

export interface FramedLine {
  text: string;
  /** Bytes of the original line (before splitting). */
  byteLength: number;
  hostTs: number;
  monotonicNs: string;
  flags: number;
  /** Original bytes when the decode was lossy or the line was truncated. */
  rawBytes?: Uint8Array;
}

export interface FramerOptions {
  /** Record marker of the device type (e.g. "COSMIC"); concatenated records are split after it. */
  recordMarker?: string | undefined;
}

const LF = 0x0a;
const CR = 0x0d;
const strictDecoder = new TextDecoder("utf-8", { fatal: true });
const lossyDecoder = new TextDecoder("utf-8", { fatal: false });

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class LineFramer {
  private pending: Buffer = Buffer.alloc(0);
  private skipLf = false;
  private readonly splitter: RegExp | null;

  constructor(options: FramerOptions = {}) {
    this.splitter =
      options.recordMarker === undefined || options.recordMarker.length === 0
        ? null
        : new RegExp(`(?<=${escapeRegex(options.recordMarker)})(?=\\d)`);
  }

  /** Feeds one read; returns every line completed by it. */
  push(bytes: Uint8Array, hostTs: number, monotonicNs: string): FramedLine[] {
    const out: FramedLine[] = [];
    let start = 0;
    const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (this.skipLf) {
        this.skipLf = false;
        if (b === LF && i === start) {
          start = i + 1;
          continue;
        }
      }
      if (b === LF || b === CR) {
        const piece = buf.subarray(start, i);
        const whole = this.pending.length === 0 ? piece : Buffer.concat([this.pending, piece]);
        this.pending = Buffer.alloc(0);
        this.emit(whole, hostTs, monotonicNs, out);
        if (b === CR) this.skipLf = true;
        start = i + 1;
      }
    }
    if (start < buf.length) {
      this.pending = Buffer.concat([this.pending, buf.subarray(start)]);
      if (this.pending.length > MAX_LINE_CHARS * 2) {
        // A line that never ends: emit what we have as a truncated line instead of growing forever.
        const whole = this.pending;
        this.pending = Buffer.alloc(0);
        this.emit(whole, hostTs, monotonicNs, out, true);
      }
    }
    return out;
  }

  /** Bytes received after the last terminator (not yet a line). */
  get pendingBytes(): number {
    return this.pending.length;
  }

  /** Drops the incomplete fragment (the port was lost: it can never be completed). */
  discardPending(): Uint8Array {
    const p = this.pending;
    this.pending = Buffer.alloc(0);
    this.skipLf = false;
    return p;
  }

  private emit(
    whole: Buffer,
    hostTs: number,
    monotonicNs: string,
    out: FramedLine[],
    forceTruncated = false,
  ): void {
    if (whole.length === 0) return;
    let text: string;
    let flags = 0;
    try {
      text = strictDecoder.decode(whole);
    } catch {
      text = lossyDecoder.decode(whole);
      flags |= RAW_FLAG_LOSSY;
    }
    if (forceTruncated || text.length > MAX_LINE_CHARS) {
      text = text.slice(0, MAX_LINE_CHARS);
      flags |= RAW_FLAG_TRUNCATED;
    }
    const keepBytes = (flags & (RAW_FLAG_LOSSY | RAW_FLAG_TRUNCATED)) !== 0;
    const pieces = this.splitter === null ? [text] : text.split(this.splitter);
    pieces.forEach((piece, index) => {
      if (piece.length === 0) return;
      const line: FramedLine = {
        text: piece,
        byteLength: whole.length,
        hostTs,
        monotonicNs,
        flags: pieces.length > 1 ? flags | RAW_FLAG_SPLIT : flags,
      };
      if (keepBytes && index === 0) line.rawBytes = new Uint8Array(whole);
      out.push(line);
    });
  }
}
