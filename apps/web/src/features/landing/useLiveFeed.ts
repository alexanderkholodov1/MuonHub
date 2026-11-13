"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fetchEvents, fetchMinutes, type MinuteRecord, type ParticleEvent } from "./live-feed";

/**
 * - `connecting`: no answer yet;
 * - `live`: the detector sent an event in the last few minutes;
 * - `quiet`: the source answers but the detector has sent nothing recently;
 * - `unavailable`: the source cannot be reached.
 */
export type FeedStatus = "connecting" | "live" | "quiet" | "unavailable";

export interface LiveFeed {
  status: FeedStatus;
  /** The last hour of recorded minutes, oldest first. */
  minutes: MinuteRecord[];
  /** Detection time of the newest event received (epoch ms). */
  newestEventTs: number | null;
  /** Events not yet drawn, oldest first. The hero takes them as their replay time comes. */
  queue: RefObject<ParticleEvent[]>;
  /** Every event received in the last few minutes, oldest first (for the running count). */
  recent: RefObject<ParticleEvent[]>;
  /** Fixed delay between a detection and its replay in the hero (ms), once known. */
  replayDelayMs: number | null;
}

export const EVENT_POLL_MS = 10_000;
export const MINUTE_POLL_MS = 60_000;
/** No event for this long means the detector is not sending now. */
export const QUIET_AFTER_MS = 3 * 60_000;
/** Replay margin over the polling period, so events arrive before their replay time. */
const REPLAY_MARGIN_MS = EVENT_POLL_MS + 5_000;
const MAX_REPLAY_DELAY_MS = 60_000;
const MAX_QUEUE = 2_000;
export const DAY_MINUTES = 1_440;

/** Minutes merged by start (newer records replace older ones), oldest first, at most `keep`. */
export function mergeMinutes(
  previous: readonly MinuteRecord[],
  incoming: readonly MinuteRecord[],
  keep: number,
): MinuteRecord[] {
  const byStart = new Map<number, MinuteRecord>();
  for (const m of previous) byStart.set(m.start, m);
  for (const m of incoming) byStart.set(m.start, m);
  return [...byStart.values()].sort((a, b) => a.start - b.start).slice(-keep);
}
const RECENT_MS = 3 * 60_000;

/**
 * Events counted so far in the minute being replayed: those detected since the start of that minute
 * and already replayed (detection + delay ≤ now). Null until the replay delay is known.
 */
export function replayedMinuteCount(
  events: readonly ParticleEvent[],
  delayMs: number | null,
  now: number,
): { minuteStart: number; count: number } | null {
  if (delayMs === null) return null;
  const replayed = now - delayMs;
  const minuteStart = Math.floor(replayed / 60_000) * 60_000;
  let count = 0;
  for (const e of events) if (e.ts >= minuteStart && e.ts <= replayed) count++;
  return { minuteStart, count };
}

export function statusFor(newestEventTs: number | null, now: number): FeedStatus {
  return newestEventTs !== null && now - newestEventTs <= QUIET_AFTER_MS ? "live" : "quiet";
}

/** The delay that keeps the replay just behind the polling: never less than the margin. */
export function replayDelayFor(newestEventTs: number, now: number): number {
  return Math.min(Math.max(now - newestEventTs, 0) + REPLAY_MARGIN_MS, MAX_REPLAY_DELAY_MS);
}

/** Polls the live source while the page is visible; stops when it is hidden or unmounted. */
export function useLiveFeed(): LiveFeed {
  const queue = useRef<ParticleEvent[]>([]);
  const recent = useRef<ParticleEvent[]>([]);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [minutes, setMinutes] = useState<MinuteRecord[]>([]);
  const [newestEventTs, setNewestEventTs] = useState<number | null>(null);
  const [replayDelayMs, setReplayDelayMs] = useState<number | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    let eventTimer: ReturnType<typeof setTimeout> | undefined;
    let minuteTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTs: number | null = null;
    let delaySet = false;

    async function pollEvents(signal: AbortSignal): Promise<void> {
      try {
        const events = await fetchEvents(lastTs, signal);
        if (signal.aborted) return;
        const newest = events.at(-1)?.ts ?? lastTs;
        if (events.length > 0) {
          queue.current.push(...events);
          if (queue.current.length > MAX_QUEUE)
            queue.current.splice(0, queue.current.length - MAX_QUEUE);
          recent.current.push(...events);
          const keepFrom = (events.at(-1)?.ts ?? 0) - RECENT_MS;
          const drop = recent.current.findIndex((e) => e.ts >= keepFrom);
          if (drop > 0) recent.current.splice(0, drop);
        }
        lastTs = newest;
        const now = Date.now();
        if (!delaySet && newest !== null && statusFor(newest, now) === "live") {
          delaySet = true;
          setReplayDelayMs(replayDelayFor(newest, now));
        }
        setNewestEventTs(newest);
        setStatus(statusFor(newest, now));
      } catch {
        if (!signal.aborted) setStatus("unavailable");
      }
      if (!signal.aborted) eventTimer = setTimeout(() => void pollEvents(signal), EVENT_POLL_MS);
    }

    let haveDay = false;
    async function pollMinutes(signal: AbortSignal): Promise<void> {
      try {
        // A day of minutes once, then only the newest ones, merged by their start.
        const recorded = await fetchMinutes(haveDay ? 5 : DAY_MINUTES, signal);
        if (!signal.aborted) {
          haveDay = true;
          setMinutes((previous) => mergeMinutes(previous, recorded, DAY_MINUTES));
        }
      } catch {
        // The events poll reports the source's state; the chart keeps its last minutes.
      }
      if (!signal.aborted) minuteTimer = setTimeout(() => void pollMinutes(signal), MINUTE_POLL_MS);
    }

    function start(): void {
      controller = new AbortController();
      // After a pause, start from the newest events again: the old ones are past their replay.
      lastTs = null;
      delaySet = false;
      queue.current.length = 0;
      recent.current.length = 0;
      haveDay = false;
      void pollEvents(controller.signal);
      void pollMinutes(controller.signal);
    }

    function stop(): void {
      controller?.abort();
      controller = null;
      clearTimeout(eventTimer);
      clearTimeout(minuteTimer);
    }

    function onVisibility(): void {
      if (document.hidden) stop();
      else if (controller === null) start();
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, []);

  return { status, minutes, newestEventTs, queue, recent, replayDelayMs };
}

/** Whether the detector is sending now, checked once a minute while the page is visible. */
export function useDetectorStatus(): FeedStatus {
  const [status, setStatus] = useState<FeedStatus>("connecting");
  useEffect(() => {
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check(signal: AbortSignal): Promise<void> {
      try {
        const newest = (await fetchEvents(null, signal, 1)).at(-1)?.ts ?? null;
        if (!signal.aborted) setStatus(statusFor(newest, Date.now()));
      } catch {
        if (!signal.aborted) setStatus("unavailable");
      }
      if (!signal.aborted) timer = setTimeout(() => void check(signal), MINUTE_POLL_MS);
    }
    function start(): void {
      controller = new AbortController();
      void check(controller.signal);
    }
    function stop(): void {
      controller?.abort();
      controller = null;
      clearTimeout(timer);
    }
    function onVisibility(): void {
      if (document.hidden) stop();
      else if (controller === null) start();
    }
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, []);
  return status;
}
