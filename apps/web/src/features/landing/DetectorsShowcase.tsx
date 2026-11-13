"use client";

import { useState, type ReactNode } from "react";
import { t } from "@/i18n/t";
import { LIVE_SOURCE } from "./live-feed";
import { DetectorTimeline, Sparkline } from "./StoryVisuals";
import type { DetectorsState } from "./useV5Detectors";
import type { V5Detector } from "./v5-detectors";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: LIVE_SOURCE.timeZone,
});

function DetectorCard({ d }: { d: V5Detector }): ReactNode {
  return (
    <li
      className={`rounded-xl border bg-surface p-4 ${d.live ? "border-accent shadow-[0_0_28px_-8px_var(--color-accent)]" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-lg font-semibold">{d.name}</p>
        {d.live && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-on-brand">
            {t("landing.detectors.liveBadge")}
          </span>
        )}
      </div>
      <div className="mt-3">
        <Sparkline values={d.recentCounts} live={d.live} />
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${d.live ? "bg-brand" : "bg-muted"}`}
        />
        {d.live
          ? t("landing.detectors.live")
          : d.lastDataTs === null
            ? t("landing.detectors.noData")
            : t("landing.detectors.lastData", { date: dateFormat.format(d.lastDataTs) })}
      </p>
      <p className="mt-1 text-sm text-muted">
        {t("landing.detectors.sessions", { count: d.sessions })}
      </p>
    </li>
  );
}

/** Every public munhub-lab detector: a card with its sparkline, and a timeline of when each recorded. */
export function DetectorsShowcase({ detectors }: { detectors: DetectorsState }): ReactNode {
  const [now] = useState(() => Date.now());
  if (detectors.status !== "ready") {
    return (
      <p className="mt-10 text-secondary" role="status">
        {detectors.status === "error"
          ? t("landing.detectors.unavailable")
          : t("landing.detectors.loading")}
      </p>
    );
  }
  return (
    <>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {detectors.data.map((d) => (
          <DetectorCard key={d.key} d={d} />
        ))}
      </ul>
      <div className="mt-6">
        <DetectorTimeline detectors={detectors.data} now={now} />
      </div>
    </>
  );
}
