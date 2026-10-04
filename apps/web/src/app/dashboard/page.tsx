"use client";

/**
 * Dashboard placeholder page — demonstrates the Card and Stat primitives.
 *
 * Shows:
 * - Realistic sample KPI readouts (clearly marked "sample data").
 * - Card in its three non-default states: empty, loading, error.
 * - The stat tiles with mono tabular-nums readouts.
 *
 * No live data or DataProvider wiring — that is a later spec.
 * Uses ONLY Observatory Dark tokens via CSS custom properties.
 */
import React, { useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Card, Stat, Button } from "@muonhub/ui";

// Realistic sample data for a USFQ (Quito, altitude 2850 m) CosmicWatch station.
// Clearly marked as sample; never presented as live.
const SAMPLE_STATS = [
  {
    label: "Corrected rate",
    value: "42.7",
    unit: "counts / min",
    trend: "up" as const,
    note: "+1.2% vs. prev hour",
  },
  {
    label: "Pressure",
    value: "730.4",
    unit: "hPa",
    trend: "neutral" as const,
    note: "stable",
  },
  {
    label: "Dead time",
    value: "3.1",
    unit: "%",
    trend: "neutral" as const,
    note: "within normal range",
  },
  {
    label: "β (baro. coeff.)",
    value: "-0.0038",
    unit: "% / hPa",
    trend: "neutral" as const,
    note: "local fit, 30-day window",
  },
] as const;

type CardState = "normal" | "loading" | "empty" | "error";

const STATE_LABELS: Record<CardState, string> = {
  normal: "Normal",
  loading: "Loading",
  empty: "Empty",
  error: "Error",
};

export default function DashboardPage() {
  const [cardState, setCardState] = useState<CardState>("normal");

  return (
    <div
      style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "var(--space-8) var(--space-6)",
      }}
    >
      {/* Page header */}
      <div
        style={{
          marginBottom: "var(--space-8)",
          paddingBottom: "var(--space-6)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-2)",
          }}
        >
          <h1
            style={{
              fontSize: "var(--text-h1)",
              fontWeight: 600,
              color: "var(--color-text)",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            Dashboard
          </h1>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--color-accent-warm)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-full)",
              padding: "2px var(--space-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Sample data
          </span>
        </div>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            margin: 0,
          }}
        >
          USFQ Station — Quito, Ecuador · 2850 m a.s.l. · CosmicWatch Mk2
        </p>
      </div>

      {/* KPI tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-8)",
        }}
      >
        {SAMPLE_STATS.map((s) => (
          <Stat
            key={s.label}
            label={s.label}
            value={s.value}
            unit={s.unit}
            trend={s.trend}
            note={s.note}
          />
        ))}
      </div>

      {/* State demo section */}
      <section style={{ marginBottom: "var(--space-8)" }}>
        <h2
          style={{
            fontSize: "var(--text-h3)",
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: "var(--space-4)",
          }}
        >
          Card states — design system demo
        </h2>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            marginBottom: "var(--space-4)",
          }}
        >
          Every component ships its empty, loading, and error states (§0 / §6 requirement). Toggle
          to verify:
        </p>

        {/* State switcher */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            flexWrap: "wrap",
            marginBottom: "var(--space-6)",
          }}
          role="group"
          aria-label="Card state selector"
        >
          {(Object.keys(STATE_LABELS) as CardState[]).map((state) => (
            <Button
              key={state}
              variant={cardState === state ? "primary" : "secondary"}
              size="sm"
              onClick={() => setCardState(state)}
              {...(state === "loading"
                ? { icon: <RefreshCw size={14} /> }
                : state === "error"
                  ? { icon: <AlertTriangle size={14} /> }
                  : {})}
            >
              {STATE_LABELS[state]}
            </Button>
          ))}
        </div>

        {/* The card in the selected state */}
        <Card
          title="Charged-particle rate · last 60 min"
          loading={cardState === "loading"}
          {...(cardState === "error"
            ? { error: "Connection to muonhub RTDB lost. Retrying in 30 s." }
            : {})}
          empty={cardState === "empty"}
          emptyMessage="No records in this time window. Detector may be offline."
        >
          {/* Normal content — simple time-series placeholder table */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "var(--text-sm)",
              }}
            >
              <thead>
                <tr>
                  {["UTC time", "Raw (counts/min)", "Corrected (counts/min)", "Pressure (hPa)"].map(
                    (col) => (
                      <th
                        key={col}
                        style={{
                          textAlign: "right",
                          padding: "var(--space-2) var(--space-3)",
                          borderBottom: "1px solid var(--color-border)",
                          color: "var(--color-text-secondary)",
                          fontWeight: 500,
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-xs)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {[
                  ["15:00", "43.2", "42.7", "730.4"],
                  ["14:59", "41.8", "41.3", "730.2"],
                  ["14:58", "44.0", "43.4", "730.6"],
                  ["14:57", "40.5", "40.0", "730.0"],
                  ["14:56", "42.9", "42.4", "730.3"],
                ].map(([time, raw, corr, pres]) => (
                  <tr key={time}>
                    {[time, raw, corr, pres].map((cell, i) => (
                      <td
                        key={i}
                        style={{
                          textAlign: "right",
                          padding: "var(--space-2) var(--space-3)",
                          borderBottom: "1px solid var(--color-border)",
                          color: "var(--color-text)",
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-muted)",
              marginTop: "var(--space-3)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Sample data — live wiring in spec S10/S11.
          </p>
        </Card>
      </section>

      {/* Stat states demo */}
      <section>
        <h2
          style={{
            fontSize: "var(--text-h3)",
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: "var(--space-4)",
          }}
        >
          Stat tile states
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <Stat label="Loading state" loading />
          <Stat label="Error state" error="Sensor timeout after 30 s." />
          <Stat
            label="Trend up"
            value="42.7"
            unit="counts / min"
            trend="up"
            note="+1.2% vs. prev hour"
          />
          <Stat
            label="Trend down"
            value="728.1"
            unit="hPa"
            trend="down"
            note="-0.3 hPa vs. prev hour"
          />
          <Stat label="Neutral" value="3.1" unit="%" trend="neutral" note="dead-time fraction" />
        </div>
      </section>
    </div>
  );
}
