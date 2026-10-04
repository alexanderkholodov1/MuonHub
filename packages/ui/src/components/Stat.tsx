"use client";

/**
 * Stat — KPI tile with a mono tabular-nums readout.
 *
 * Scientific instrument readout style:
 * - Value in Geist Mono, tabular-nums, right-aligned.
 * - Unit label below the value in secondary color.
 * - Optional trend indicator (up/down/neutral) with color semantics.
 * - Loading skeleton and error states.
 * - No raw hex; all tokens via CSS custom properties.
 */
import React from "react";
import { type LucideIcon, TrendingDown, TrendingUp, Minus, Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

export type StatTrend = "up" | "down" | "neutral";

export interface StatProps {
  /** Label describing the metric. */
  label: string;
  /** The numeric/text value to display in mono. */
  value?: string | number;
  /** Unit string (e.g. "counts / min", "hPa"). */
  unit?: string;
  /** Optional trend direction. */
  trend?: StatTrend;
  /** Optional sub-note (e.g. "vs. last hour"). */
  note?: string;
  /** Show loading skeleton. */
  loading?: boolean;
  /** Error message to display. */
  error?: string;
  className?: string;
}

const trendConfig: Record<StatTrend, { icon: LucideIcon; color: string }> = {
  up: { icon: TrendingUp, color: "text-[var(--color-success)]" },
  down: { icon: TrendingDown, color: "text-[var(--color-danger)]" },
  neutral: { icon: Minus, color: "text-[var(--color-text-muted)]" },
};

export function Stat({
  label,
  value,
  unit,
  trend,
  note,
  loading = false,
  error,
  className,
}: StatProps): React.ReactElement {
  const TrendIcon = trend ? trendConfig[trend].icon : null;
  const trendColor = trend ? trendConfig[trend].color : "";

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]",
        "p-4 flex flex-col gap-1 min-h-[36px]",
        className,
      )}
      role="figure"
      aria-label={label}
    >
      {/* Label */}
      <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wide font-medium">
        {label}
      </span>

      {/* Value area */}
      {loading ? (
        <div
          className="flex items-center gap-2 text-[var(--color-text-muted)]"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          <span className="text-sm">—</span>
        </div>
      ) : error ? (
        <span className="text-sm text-[var(--color-danger)]" role="alert" title={error}>
          Error
        </span>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="font-mono tabular-nums text-[length:var(--text-h2)] font-semibold text-[var(--color-text)] leading-none">
            {value ?? "—"}
          </span>
          {unit && (
            <span className="text-xs text-[var(--color-text-secondary)] font-mono">{unit}</span>
          )}
        </div>
      )}

      {/* Trend + note */}
      {!loading && !error && (trend ?? note) && (
        <div className={cn("flex items-center gap-1 text-xs", trendColor)}>
          {TrendIcon && <TrendIcon size={12} />}
          {note && <span className="text-[var(--color-text-muted)]">{note}</span>}
        </div>
      )}
    </div>
  );
}
