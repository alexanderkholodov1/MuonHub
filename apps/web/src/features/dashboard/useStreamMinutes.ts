"use client";

/**
 * Loads a stream's minutes for the last `hours` and then asks for newer minutes every minute
 * (spec 0090). Reads on demand instead of a realtime subscription, to stay far from the Realtime
 * Database's 100 simultaneous connections (ADR-005). Connection health is tracked apart from the data.
 */
import { useEffect, useState } from "react";
import type { v2 as dp } from "@muonhub/data-provider";
import type { v2 } from "@muonhub/shared";
import { errorMessage } from "@/lib/errors";
import { MINUTE_MS } from "./series";

export interface StreamMinutes {
  readonly status: "loading" | "ready" | "error";
  readonly minutes: readonly v2.MinuteRecord[];
  readonly fromTs: number;
  readonly toTs: number;
  /** Safe message of the last failed read, or null after a successful one. */
  readonly error: string | null;
  /** When the server last answered successfully. */
  readonly lastOkAt: number | null;
}

async function readRange(
  provider: dp.DataProviderV2,
  streamId: string,
  fromTs: number,
  toTs: number,
): Promise<v2.MinuteRecord[]> {
  const out: v2.MinuteRecord[] = [];
  let cursor: string | null = null;
  do {
    const page: dp.Page<v2.MinuteRecord> = await provider.readMinutes(streamId, {
      fromTs,
      toTs,
      limit: 2000,
      cursor,
    });
    out.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return out;
}

export function useStreamMinutes(
  provider: dp.DataProviderV2 | null,
  streamId: string,
  hours: number,
  refreshMs = MINUTE_MS,
): StreamMinutes {
  const [state, setState] = useState<StreamMinutes>(() => ({
    status: "loading",
    minutes: [],
    fromTs: 0,
    toTs: 0,
    error: null,
    lastOkAt: null,
  }));

  useEffect(() => {
    if (provider === null) return;
    let current = true;
    let byTs = new Map<number, v2.MinuteRecord>();
    const window = (): { fromTs: number; toTs: number } => {
      const toTs = Date.now();
      return { fromTs: Math.floor((toTs - hours * 3_600_000) / MINUTE_MS) * MINUTE_MS, toTs };
    };
    const publish = (error: string | null): void => {
      const { fromTs, toTs } = window();
      for (const ts of byTs.keys()) if (ts < fromTs) byTs.delete(ts);
      const minutes = [...byTs.values()].sort((a, b) => a.ts - b.ts);
      setState((s) => ({
        status: error !== null && s.status !== "ready" ? "error" : "ready",
        minutes,
        fromTs,
        toTs,
        error,
        lastOkAt: error === null ? Date.now() : s.lastOkAt,
      }));
    };
    const load = async (): Promise<void> => {
      const { fromTs, toTs } = window();
      const newest = byTs.size === 0 ? null : Math.max(...byTs.keys());
      try {
        const rows = await readRange(
          provider,
          streamId,
          newest === null ? fromTs : newest + MINUTE_MS,
          toTs,
        );
        if (!current) return;
        for (const m of rows) byTs.set(m.ts, m);
        publish(null);
      } catch (error) {
        if (current) publish(errorMessage(error));
      }
    };
    setState((s) => ({ ...s, status: "loading", minutes: [] }));
    byTs = new Map();
    void load();
    const timer = setInterval(() => void load(), refreshMs);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [provider, streamId, hours, refreshMs]);

  return state;
}
