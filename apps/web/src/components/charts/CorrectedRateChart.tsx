"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import type { Config, Data, Layout } from "plotly.js";
import type { PlotParams } from "react-plotly.js";
import type { Station } from "@muonhub/shared";
import { GAP_THRESHOLD_MS } from "@muonhub/shared";
import type { CorrectedRateInsights } from "@muonhub/physics";
import { Card } from "@muonhub/ui";

const Plot = dynamic<PlotParams>(
  async () => {
    const [factoryModule, plotlyModule] = await Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min"),
    ]);
    return factoryModule.default(plotlyModule.default);
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[360px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
        Preparing chart surface...
      </div>
    ),
  },
);

const PLOT_CONFIG: Partial<Config> = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
};

export const SINGLE_STATION_TOOLTIP =
  "A single SiPM does not classify particles. The defensible metric is the integral rate of charged particles / MIP-type event rate, with declared uncertainty.";

export const COINCIDENCE_STATION_TOOLTIP =
  "Coincidence stations use multiple detectors in a shared time window; the coincidence channel is the selected-rate observable.";

interface GappedSeries {
  readonly x: Array<Date | null>;
  readonly y: Array<number | null>;
}

export function correctedRateMetricLabel(stationType: Station["type"]): string {
  return stationType === "coincidence"
    ? "Selected coincidence rate"
    : "Charged-particle / MIP-type rate";
}

export function correctedRateTooltip(stationType: Station["type"]): string {
  return stationType === "coincidence" ? COINCIDENCE_STATION_TOOLTIP : SINGLE_STATION_TOOLTIP;
}

export function CorrectedRateChart({
  stationType,
  insights,
  logScale,
  primaryMetricLabel = correctedRateMetricLabel(stationType),
}: {
  readonly stationType: Station["type"];
  readonly insights: CorrectedRateInsights;
  readonly logScale: boolean;
  readonly primaryMetricLabel?: string;
}): React.ReactElement {
  const chart = useMemo(
    () => correctedRateChartModel(insights, logScale, primaryMetricLabel),
    [insights, logScale, primaryMetricLabel],
  );

  return (
    <Card title={`${primaryMetricLabel} · corrected rate`}>
      <Plot
        data={chart.data}
        layout={chart.layout}
        config={PLOT_CONFIG}
        className="min-h-[460px] w-full"
        style={{ width: "100%", minHeight: "460px" }}
        useResizeHandler
      />
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        Raw event counts provide the Poisson uncertainty; the primary series is corrected rate, not
        raw event rate. Gaps of at least {GAP_THRESHOLD_MS / 60_000} minutes break the line.{" "}
        {correctedRateTooltip(stationType)}
      </p>
    </Card>
  );
}

function correctedRateChartModel(
  insights: CorrectedRateInsights,
  logScale: boolean,
  primaryMetricLabel: string,
): { readonly data: Data[]; readonly layout: Partial<Layout> } {
  const correctedSeries = gappedSeries(insights.points, (point) => point.barometricCorrectedRate);
  const correctedUpper = gappedSeries(insights.points, (point) =>
    point.barometricCorrectedRate == null || point.barometricSigma == null
      ? null
      : point.barometricCorrectedRate + point.barometricSigma,
  );
  const correctedLower = gappedSeries(insights.points, (point) =>
    point.barometricCorrectedRate == null || point.barometricSigma == null
      ? null
      : Math.max(0, point.barometricCorrectedRate - point.barometricSigma),
  );
  const deadTimeSeries = gappedSeries(insights.points, (point) => point.deadTimeCorrectedRate);
  const anomalySeries = {
    x: insights.anomalies.map((anomaly) => new Date(anomaly.ts)),
    y: insights.anomalies.map((anomaly) => anomaly.correctedRate),
  };

  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "sqrt(N) lower band",
      x: correctedLower.x,
      y: correctedLower.y,
      line: { color: "transparent" },
      hoverinfo: "skip",
      showlegend: false,
    },
    {
      type: "scatter",
      mode: "lines",
      name: "sqrt(N) band",
      x: correctedUpper.x,
      y: correctedUpper.y,
      fill: "tonexty",
      fillcolor: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
      line: { color: "transparent" },
      hoverinfo: "skip",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Dead-time corrected ecDt",
      x: deadTimeSeries.x,
      y: deadTimeSeries.y,
      line: { color: "var(--color-data-2)", width: 1.5 },
      connectgaps: false,
      hovertemplate: "%{x}<br>ecDt %{y:.2f} counts/min<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Pressure corrected ecCorr",
      x: correctedSeries.x,
      y: correctedSeries.y,
      line: { color: "var(--color-accent)", width: 2.4 },
      connectgaps: false,
      hovertemplate: "%{x}<br>ecCorr %{y:.2f} counts/min<extra></extra>",
    },
    {
      type: "scatter",
      mode: "markers",
      name: ">=3 sigma flags",
      x: anomalySeries.x,
      y: anomalySeries.y,
      marker: {
        color: "var(--color-warning)",
        size: 9,
        symbol: "triangle-up",
        line: { color: "var(--color-bg)", width: 1 },
      },
      hovertemplate: "%{x}<br>flag %{y:.2f} counts/min<extra></extra>",
    },
  ];

  if (insights.baseline != null) {
    data.push(
      baselineTrace(insights, insights.baseline.lower, "Baseline lower", false),
      baselineTrace(insights, insights.baseline.upper, "Robust baseline band", true),
    );
  }

  return {
    data,
    layout: {
      title: { text: primaryMetricLabel, font: { color: "var(--color-text)", size: 16 } },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { color: "var(--color-text-secondary)", family: "var(--font-mono)" },
      margin: { t: 48, r: 24, b: 56, l: 64 },
      hovermode: "x unified",
      legend: {
        orientation: "h",
        x: 0,
        xanchor: "left",
        y: 1.12,
        yanchor: "bottom",
        font: { color: "var(--color-text-secondary)", family: "var(--font-mono)", size: 12 },
      },
      xaxis: {
        title: { text: "UTC time", font: { color: "var(--color-text-secondary)" } },
        gridcolor: "color-mix(in srgb, var(--color-border) 55%, transparent)",
        zerolinecolor: "var(--color-border)",
        tickfont: { color: "var(--color-text-secondary)", family: "var(--font-mono)" },
      },
      yaxis: {
        title: { text: "Corrected rate (counts / min)", font: { color: "var(--color-text-secondary)" } },
        type: logScale ? "log" : "linear",
        gridcolor: "color-mix(in srgb, var(--color-border) 55%, transparent)",
        zerolinecolor: "var(--color-border)",
        tickfont: { color: "var(--color-text-secondary)", family: "var(--font-mono)" },
        rangemode: "tozero",
      },
      shapes: [],
    },
  };
}

function baselineTrace(
  insights: CorrectedRateInsights,
  value: number,
  name: string,
  fill: boolean,
): Data {
  const x = insights.points.map((point) => new Date(point.ts));
  const y = insights.points.map(() => value);
  const trace = {
    type: "scatter",
    mode: "lines",
    name,
    x,
    y,
    line: { color: "var(--color-data-3)", width: 1, dash: "dot" },
    hoverinfo: "skip",
    showlegend: fill,
  } satisfies Data;
  if (fill) {
    return {
      ...trace,
      fill: "tonexty",
      fillcolor: "color-mix(in srgb, var(--color-data-3) 14%, transparent)",
    } satisfies Data;
  }
  return trace;
}

function gappedSeries(
  points: CorrectedRateInsights["points"],
  readValue: (point: CorrectedRateInsights["points"][number]) => number | null,
): GappedSeries {
  const x: Array<Date | null> = [];
  const y: Array<number | null> = [];
  let previousTs: number | null = null;

  for (const point of points) {
    if (previousTs != null && point.ts - previousTs >= GAP_THRESHOLD_MS) {
      x.push(new Date(previousTs + 1));
      y.push(null);
    }
    const value = readValue(point);
    x.push(new Date(point.ts));
    y.push(value == null || !Number.isFinite(value) ? null : value);
    previousTs = point.ts;
  }

  return { x, y };
}
