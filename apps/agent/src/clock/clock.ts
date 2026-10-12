/**
 * Clock provenance (spec 0087 FR7b, FR14): read-only `timedatectl show` and `chronyc tracking`
 * queries through `execFile` (never a shell), and the boot hold: minute output is held after boot
 * until the OS reports `NTPSynchronized=yes`; after 10 minutes without it, minutes are produced with
 * `timeProvenance.source: "none"` — never silently labelled `ntp`.
 */
import { execFile } from "node:child_process";
import type { v2 } from "@muonhub/shared";

export interface ClockReading {
  synchronized: boolean;
  /** Offset of the system clock from its reference, ms (0 when unknown). */
  offsetMs: number;
  driftPpm?: number;
  /** False when no tool could be queried at all. */
  known: boolean;
}

export interface ClockProbe {
  read(): Promise<ClockReading>;
}

function run(cmd: string, args: string[], timeoutMs = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (error, stdout) => {
      resolve(error ? null : stdout);
    });
  });
}

/** Parses `chronyc -c tracking` (CSV): field 4 = system time offset (s), field 7 = frequency (ppm). */
export function parseChronyTracking(csv: string): { offsetMs: number; driftPpm: number } | null {
  const f = csv.trim().split(",");
  const off = Number(f[4]);
  const ppm = Number(f[7]);
  if (f.length < 8 || !Number.isFinite(off)) return null;
  return { offsetMs: off * 1000, driftPpm: Number.isFinite(ppm) ? ppm : 0 };
}

export function createSystemClockProbe(): ClockProbe {
  return {
    async read() {
      const td = await run("timedatectl", ["show", "-p", "NTPSynchronized", "--value"]);
      const chrony = await run("chronyc", ["-c", "tracking"]);
      const parsed = chrony === null ? null : parseChronyTracking(chrony);
      return {
        known: td !== null || parsed !== null,
        synchronized: td?.trim() === "yes",
        offsetMs: parsed?.offsetMs ?? 0,
        ...(parsed === null ? {} : { driftPpm: parsed.driftPpm }),
      };
    },
  };
}

export const BOOT_HOLD_MS = 10 * 60_000;
export const CLOCK_POLL_MS = 10 * 60_000;

export class ClockGate {
  private reading: ClockReading = { synchronized: false, offsetMs: 0, known: false };
  private measuredAt: number;
  private holdingNow: boolean;
  private readonly releasedListeners: ((how: "synced" | "timeout") => void)[] = [];
  private readonly started: number;

  constructor(
    private readonly now: () => number,
    options: { hold: boolean; holdMs?: number } = { hold: true },
  ) {
    this.started = now();
    this.measuredAt = this.started;
    this.holdingNow = options.hold;
    this.holdMs = options.holdMs ?? BOOT_HOLD_MS;
  }

  private readonly holdMs: number;

  /** True while minutes must be held back (boot, clock not yet synchronized). */
  get holding(): boolean {
    return this.holdingNow;
  }

  get synchronized(): boolean {
    return this.reading.synchronized;
  }

  onRelease(fn: (how: "synced" | "timeout") => void): void {
    this.releasedListeners.push(fn);
  }

  /** Feeds a probe result; releases the hold when synchronized or after the timeout. */
  update(reading: ClockReading): void {
    this.reading = reading;
    this.measuredAt = this.now();
    this.evaluate();
  }

  /** Called periodically: releases the hold on timeout even without a probe result. */
  evaluate(): void {
    if (!this.holdingNow) return;
    if (this.reading.synchronized) this.release("synced");
    else if (this.now() - this.started >= this.holdMs) this.release("timeout");
  }

  private release(how: "synced" | "timeout"): void {
    this.holdingNow = false;
    for (const fn of this.releasedListeners) fn(how);
  }

  provenance(): v2.TimeProvenance {
    const source = this.reading.synchronized ? "ntp" : "none";
    return {
      source,
      offsetMs: source === "ntp" ? this.reading.offsetMs : 0,
      ...(source === "ntp" && this.reading.driftPpm !== undefined
        ? { driftPpm: this.reading.driftPpm }
        : {}),
      measuredAt: this.measuredAt,
    };
  }
}
