"use client";

import { useEffect, useState } from "react";
import { fetchV5Detectors, type V5Detector } from "./v5-detectors";

export type DetectorsState =
  { status: "loading" } | { status: "ready"; data: V5Detector[] } | { status: "error" };

const REFRESH_MS = 2 * 60_000;

/** munhub-lab's public detectors, read once and then every two minutes while the page is visible. */
export function useV5Detectors(): DetectorsState {
  const [state, setState] = useState<DetectorsState>({ status: "loading" });
  useEffect(() => {
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load(signal: AbortSignal): Promise<void> {
      try {
        const data = await fetchV5Detectors(signal);
        if (!signal.aborted) setState({ status: "ready", data });
      } catch {
        if (!signal.aborted) setState((s) => (s.status === "ready" ? s : { status: "error" }));
      }
      if (!signal.aborted) timer = setTimeout(() => void load(signal), REFRESH_MS);
    }
    function start(): void {
      controller = new AbortController();
      void load(controller.signal);
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
  return state;
}
