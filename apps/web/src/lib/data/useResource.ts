"use client";

/**
 * Loads one resource with visible states (spec 0088 FR4). A newer key or an unmount makes the
 * older load's result irrelevant: it is ignored, never rendered.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";

export type Resource<T> =
  | { status: "loading"; data: null; error: null; reload: () => void }
  | { status: "ready"; data: T; error: null; reload: () => void }
  | { status: "error"; data: null; error: string; reload: () => void };

export function useResource<T>(key: string | null, load: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: string }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key === null) return;
    let current = true;
    setState({ status: "loading" });
    loadRef.current().then(
      (data) => {
        if (current) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (current) setState({ status: "error", error: errorMessage(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  if (state.status === "ready") return { status: "ready", data: state.data, error: null, reload };
  if (state.status === "error") return { status: "error", data: null, error: state.error, reload };
  return { status: "loading", data: null, error: null, reload };
}
