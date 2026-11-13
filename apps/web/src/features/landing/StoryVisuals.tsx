"use client";

import type { ReactNode } from "react";
import { t } from "@/i18n/t";
import type { V5Detector } from "./v5-detectors";

/** A small line of a detector's last recorded minutes. */
export function Sparkline({
  values,
  live,
}: {
  values: readonly number[];
  live: boolean;
}): ReactNode {
  if (values.length < 2) return <div className="h-10" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * 100).toFixed(2)},${(36 - ((v - min) / span) * 32).toFixed(2)}`,
    )
    .join("");
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className={`h-10 w-full ${live ? "text-accent" : "text-cosmic"}`}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/** When each detector recorded: a bar from its first to its latest data, over this year. */
export function DetectorTimeline({
  detectors,
  now,
}: {
  detectors: readonly V5Detector[];
  now: number;
}): ReactNode {
  const year = new Date(now).getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Math.max(now, start + 1);
  const pct = (ts: number): number =>
    Math.min(Math.max(((ts - start) / (end - start)) * 100, 0), 100);
  const months = Array.from({ length: new Date(now).getUTCMonth() + 1 }, (_, i) =>
    Date.UTC(year, i, 1),
  );
  const rows = detectors.filter((d) => d.lastDataTs !== null);
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-sm text-secondary">{t("landing.timeline.title", { year })}</p>
      <div className="relative mt-4">
        <div className="ml-[7.75rem] relative h-4 font-mono text-xs text-muted sm:ml-[9.75rem]">
          {months.map((m) => (
            <span key={m} className="absolute" style={{ left: `${String(pct(m))}%` }}>
              {monthFormat.format(m)}
            </span>
          ))}
        </div>
        <ul className="mt-2 space-y-2">
          {rows.map((d) => {
            const from = pct(d.firstDataTs ?? d.lastDataTs ?? start);
            const to = pct(d.lastDataTs ?? start);
            return (
              <li key={d.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate font-mono text-sm sm:w-36">{d.name}</span>
                <span className="relative h-3 flex-1 rounded-full bg-surface-2">
                  <span
                    className={`absolute top-0 h-3 rounded-full ${d.live ? "bg-accent" : "bg-cosmic"}`}
                    style={{ left: `${String(from)}%`, width: `max(${String(to - from)}%, 6px)` }}
                  />
                  {d.live && (
                    <span
                      className="absolute -top-1 h-5 w-1 rounded-full bg-brand"
                      style={{ left: `calc(${String(to)}% - 2px)` }}
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * How a detection happens and reaches this page: a cosmic ray hits the atmosphere, its shower reaches
 * the ground, the detector flashes, the agent sends the count, anyone sees it. Animated with CSS
 * (the flows and the flash), still when reduced motion is asked for.
 */
export function ShowerDiagram(): ReactNode {
  const showers = [
    [250, 92, 196, 214],
    [250, 92, 228, 214],
    [250, 92, 262, 214],
    [250, 92, 296, 214],
    [250, 92, 158, 214],
    [250, 92, 332, 214],
  ] as const;
  return (
    <svg
      viewBox="0 0 960 300"
      className="h-auto w-full"
      role="img"
      aria-label={t("landing.how.diagramLabel")}
    >
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-cosmic)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-cosmic)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="20" y="60" width="460" height="90" rx="12" fill="url(#sky)" />
      <text x="36" y="84" className="fill-cosmic font-mono text-xs">
        {t("landing.how.atmosphere")}
      </text>
      {/* The primary cosmic ray, from space. */}
      <line
        x1="120"
        y1="0"
        x2="250"
        y2="92"
        className="flow stroke-brand"
        strokeWidth={3}
        strokeDasharray="10 8"
      />
      <circle cx="250" cy="92" r="6" className="fill-brand" />
      <text x="36" y="24" className="fill-brand font-mono text-xs">
        {t("landing.how.primary")}
      </text>
      {/* Its shower. */}
      {showers.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className="flow stroke-accent"
          strokeWidth={2}
          strokeDasharray="6 10"
          style={{ animationDelay: `${String(i * 0.15)}s` }}
        />
      ))}
      {/* Ground and the detector. */}
      <line x1="20" y1="236" x2="480" y2="236" className="stroke-border" strokeWidth={2} />
      <rect x="200" y="212" width="100" height="16" rx="3" className="flash fill-accent" />
      <rect
        x="200"
        y="212"
        width="100"
        height="16"
        rx="3"
        fill="none"
        className="stroke-brand"
        strokeWidth={2}
      />
      <text x="250" y="262" textAnchor="middle" className="fill-text text-sm">
        {t("landing.how.detector.title")}
      </text>
      {/* Agent → MuonHub → everyone. */}
      <path
        d="M300 220 C 380 220, 400 150, 520 150"
        fill="none"
        className="flow stroke-accent"
        strokeWidth={2}
        strokeDasharray="6 10"
      />
      <rect
        x="520"
        y="118"
        width="120"
        height="64"
        rx="10"
        className="fill-surface stroke-border"
        strokeWidth={2}
      />
      <text x="580" y="155" textAnchor="middle" className="fill-text text-sm">
        {t("landing.how.agent.title")}
      </text>
      <path
        d="M640 150 L 720 150"
        className="flow stroke-accent"
        strokeWidth={2}
        strokeDasharray="6 10"
      />
      <rect
        x="720"
        y="118"
        width="120"
        height="64"
        rx="32"
        className="fill-surface stroke-cosmic"
        strokeWidth={2}
      />
      <text x="780" y="155" textAnchor="middle" className="fill-text text-sm">
        {t("app.name")}
      </text>
      <path
        d="M840 150 L 900 150"
        className="flow stroke-brand"
        strokeWidth={2}
        strokeDasharray="6 10"
      />
      <circle cx="922" cy="150" r="20" className="fill-none stroke-brand" strokeWidth={2} />
      <text x="922" y="200" textAnchor="middle" className="fill-text text-sm">
        {t("landing.how.you")}
      </text>
    </svg>
  );
}

/** Cutoff rigidity, as bars on one scale: who gets through the magnetic shield where. */
export function CutoffBars(): ReactNode {
  const max = 17;
  const rows = [
    {
      label: t("landing.equator.cutoff"),
      value: "≈ 12–13 GV",
      from: 12,
      to: 13,
      tone: "bg-brand",
      text: "text-brand",
    },
    {
      label: t("landing.equator.poles"),
      value: "≈ 1 GV",
      from: 1,
      to: 1,
      tone: "bg-accent",
      text: "text-accent",
    },
    {
      label: t("landing.equator.maximum"),
      value: "≈ 17 GV",
      from: 17,
      to: 17,
      tone: "bg-cosmic",
      text: "text-cosmic",
    },
  ];
  return (
    <div className="rounded-lg border border-border bg-bg p-5">
      <ul className="space-y-5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-secondary">{r.label}</span>
              <span className={`whitespace-nowrap font-mono text-xl tabular-nums ${r.text}`}>
                {r.value}
              </span>
            </div>
            <div className="relative mt-2 h-3 rounded-full bg-surface-2">
              <div
                className={`h-3 rounded-full ${r.tone}`}
                style={{ width: `${String((r.from / max) * 100)}%` }}
              />
              {r.to > r.from && (
                <div
                  className={`absolute top-0 h-3 rounded-r-full opacity-50 ${r.tone}`}
                  style={{
                    left: `${String((r.from / max) * 100)}%`,
                    width: `${String(((r.to - r.from) / max) * 100)}%`,
                  }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="relative mt-3 h-4 font-mono text-xs text-muted">
        {[0, 5, 10, 15].map((v) => (
          <span
            key={v}
            className="absolute -translate-x-1/2"
            style={{ left: `${String((v / max) * 100)}%` }}
          >
            {v === 15 ? "15 GV" : v}
          </span>
        ))}
      </div>
      <p className="mt-4 text-sm text-secondary">{t("landing.equator.barsNote")}</p>
    </div>
  );
}
