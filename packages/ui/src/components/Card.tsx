"use client";

/**
 * Card — Observatory Dark surface primitive.
 *
 * Elevation via border + surface step (not heavy shadows) per DESIGN-LANGUAGE §3.
 * Ships empty, loading, and error states.
 */
import React from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

export interface CardProps {
  /** Card heading. */
  title?: React.ReactNode;
  /** Card body content. */
  children?: React.ReactNode;
  /** Show a loading skeleton overlay. */
  loading?: boolean;
  /** If set, renders an error state with this message. */
  error?: string;
  /** If true, renders an empty state. Ignored if loading or error are set. */
  empty?: boolean;
  /** Custom empty-state message. */
  emptyMessage?: string;
  className?: string;
}

export function Card({
  title,
  children,
  loading = false,
  error,
  empty = false,
  emptyMessage = "No data available.",
  className,
}: CardProps): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)]",
        "bg-[var(--color-surface)]",
        "p-6",
        className,
      )}
      role="region"
      aria-label={typeof title === "string" ? title : undefined}
    >
      {title && (
        <h3 className="text-[length:var(--text-h3)] font-semibold text-[var(--color-text)] mb-4 leading-snug">
          {title}
        </h3>
      )}

      {/* Loading state */}
      {loading && (
        <div
          className="flex items-center justify-center gap-3 py-8 text-[var(--color-text-secondary)]"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="animate-spin" size={20} aria-hidden="true" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-start gap-3 py-6 text-[var(--color-danger)]" role="alert">
          <AlertCircle size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Error</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && empty && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--color-text-muted)]">
          <Inbox size={32} aria-hidden="true" />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      )}

      {/* Normal content */}
      {!loading && !error && !empty && children}
    </div>
  );
}
