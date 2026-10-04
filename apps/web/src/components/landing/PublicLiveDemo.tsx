"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Detector, MinuteRecord, Station } from "@muonhub/shared";
import { DEFAULT_BETA_MIN_POINTS, buildCorrectedRateInsights } from "@muonhub/physics";
import type { CorrectedRateInsights } from "@muonhub/physics";
import { Button, Card, Stat } from "@muonhub/ui";
import { Activity, Gauge } from "lucide-react";
import {
  CorrectedRateChart,
  correctedRateMetricLabel,
  correctedRateTooltip,
} from "../charts/CorrectedRateChart";
import { getDataProvider, isDataProviderConfigurationError } from "../../lib/data-provider";

const DEMO_WINDOW_MS = 24 * 60 * 60 * 1000;
const REALTIME_REFRESH_THROTTLE_MS = 15_000;

export interface PublicDemoDetector {
  readonly detectorId: string;
  readonly hwVersion: Detector["hwVersion"];
  readonly stationType: Station["type"];
  readonly city: string;
  readonly country: string;
}

export function PublicLiveDemo({
  detector,
}: {
  readonly detector: PublicDemoDetector | null;
}): React.ReactElement {
  const [records, setRecords] = useState<MinuteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logScale, setLogScale] = useState(false);

  useEffect(() => {
    if (detector == null) {
      setRecords([]);
      setError(null);
      setLoading(false);
      return;
    }
    const activeDetector = detector;

    let active = true;
    let unsubscribe: (() => void) | null = null;
    let lastRefresh = 0;

    async function loadRecords(): Promise<void> {
      const provider = await getDataProvider();
      const toTs = Date.now();
      const fromTs = toTs - DEMO_WINDOW_MS;
      const minuteRecords = await provider.getMinuteRecords(activeDetector.detectorId, {
        fromTs,
        toTs,
      });
      if (!active) return;
      setRecords(minuteRecords);
      lastRefresh = Date.now();
    }

    setLoading(true);
    setError(null);

    void getDataProvider()
      .then(async (provider) => {
        await loadRecords();
        if (!active) return;
        unsubscribe = provider.subscribeRealtime(activeDetector.detectorId, () => {
          if (Date.now() - lastRefresh < REALTIME_REFRESH_THROTTLE_MS) return;
          void loadRecords().catch((err: unknown) => {
            if (!active) return;
            setError(errorMessage(err, "The live demo could not refresh public detector data."));
          });
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(errorMessage(err, "The live demo could not load public detector data."));
        setRecords([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [detector]);

  const insights = useMemo<CorrectedRateInsights | null>(() => {
    if (detector == null || records.length === 0) return null;
    return buildCorrectedRateInsights(records, detector.hwVersion);
  }, [detector, records]);

  if (detector == null) {
    return (
      <Card
        title="Live public detector demo"
        empty
        emptyMessage="Waiting for a public detector with shared data."
      />
    );
  }

  const primaryMetricLabel = correctedRateMetricLabel(detector.stationType);
  const latestPoint = insights?.points[insights.points.length - 1] ?? null;

  return (
    <section className="grid gap-6" aria-labelledby="live-demo-title">
      <Card
        title={
          <span id="live-demo-title" className="flex items-center gap-2">
            <Activity size={22} aria-hidden="true" />
            Live public detector demo
          </span>
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="m-0 max-w-[820px] text-base leading-relaxed text-[var(--color-text-secondary)]">
              Recent public data from {detector.city}, {detector.country}. The chart shows{" "}
              {primaryMetricLabel.toLocaleLowerCase("en-US")} with dead-time and local barometric
              corrections computed by <span className="font-mono">@muonhub/physics</span>.
            </p>
            <p className="mt-3 max-w-[820px] text-sm leading-relaxed text-[var(--color-text-muted)]">
              {correctedRateTooltip(detector.stationType)}
            </p>
          </div>
          <Button
            variant={logScale ? "primary" : "secondary"}
            size="sm"
            onClick={() => setLogScale((current) => !current)}
            icon={<Gauge size={14} aria-hidden="true" />}
          >
            {logScale ? "Log scale on" : "Log scale"}
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card title="Loading live demo data" loading />
      ) : error != null ? (
        <Card title="Live demo unavailable" error={error} />
      ) : insights == null || latestPoint == null ? (
        <Card
          title="Live demo waiting for data"
          empty
          emptyMessage="The public detector is registered, but no minute records are available in the recent demo window yet."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat
              label={primaryMetricLabel}
              value={formatMaybeNumber(
                latestPoint.barometricCorrectedRate ?? latestPoint.deadTimeCorrectedRate,
              )}
              unit="counts / min"
              note={
                latestPoint.barometricCorrectedRate == null
                  ? "dead-time corrected"
                  : "dead-time + pressure corrected"
              }
            />
            <Stat
              label="Pressure"
              value={formatMaybeNumber(latestPoint.pressureHpa, 1)}
              unit="hPa"
              note="latest public minute"
            />
            <Stat
              label="Beta"
              value={
                insights.beta == null
                  ? "collecting"
                  : formatMaybeNumber(insights.beta.fit.betaPercentPerHpa, 3)
              }
              unit={insights.beta == null ? "" : "% / hPa"}
              note={
                insights.beta == null
                  ? `${insights.usableBetaSampleCount}/${DEFAULT_BETA_MIN_POINTS} samples`
                  : `r2 ${formatMaybeNumber(insights.beta.fit.rSquared, 3)}`
              }
            />
            <Stat
              label="Records"
              value={records.length.toLocaleString("en-US")}
              unit="24 h"
              note="public demo window"
            />
          </div>
          <CorrectedRateChart
            stationType={detector.stationType}
            insights={insights}
            logScale={logScale}
            primaryMetricLabel={primaryMetricLabel}
          />
        </>
      )}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (isDataProviderConfigurationError(error)) {
    return error.state.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatMaybeNumber(value: number | null | undefined, fractionDigits = 2): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}
