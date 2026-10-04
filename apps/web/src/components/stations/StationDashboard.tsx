"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Config, Data, Layout, Shape } from "plotly.js";
import type { PlotParams } from "react-plotly.js";
import type { Detector, MinuteRecord, Station } from "@muonhub/shared";
import {
  DEFAULT_BETA_MIN_POINTS,
  buildAmplitudeHistogram,
  buildCorrectedRateInsights,
  estimateMpv,
  type CorrectedRateInsights,
} from "@muonhub/physics";
import { Button, Card, Stat } from "@muonhub/ui";
import { Activity, AlertTriangle, BarChart3, Gauge, Sigma } from "lucide-react";
import {
  CorrectedRateChart,
  correctedRateMetricLabel,
  correctedRateTooltip,
} from "../charts/CorrectedRateChart";
import { getDataProvider } from "../../lib/data-provider";

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

type RangeKey = "24h" | "7d" | "30d";

const DEFAULT_RANGE = { key: "7d", label: "7 d", durationMs: 7 * 24 * 60 * 60 * 1000 } as const;
const RANGES: ReadonlyArray<{ key: RangeKey; label: string; durationMs: number }> = [
  { key: "24h", label: "24 h", durationMs: 24 * 60 * 60 * 1000 },
  DEFAULT_RANGE,
  { key: "30d", label: "30 d", durationMs: 30 * 24 * 60 * 60 * 1000 },
];

const ANOMALY_DISCLAIMER =
  "Individual-minute anomalies are statistical noise; confirmed anomalies need sustained deviation or multi-station coincidence.";

const PLOT_CONFIG: Partial<Config> = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
};

interface StationDashboardProps {
  readonly station: Station;
  readonly detectors: ReadonlyArray<Detector>;
}

interface SpectrumModel {
  readonly histogram: ReturnType<typeof buildAmplitudeHistogram>;
  readonly mpv: number;
  readonly thresholdMv: number | null;
}

export function StationDashboard({
  station,
  detectors,
}: StationDashboardProps): React.ReactElement {
  const activeDetectors = useMemo(
    () => detectors.filter((detector) => detector.status === "active"),
    [detectors],
  );
  const availableDetectors = activeDetectors.length > 0 ? activeDetectors : detectors;
  const [detectorId, setDetectorId] = useState<string | null>(
    () => availableDetectors[0]?.id ?? null,
  );
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const [logScale, setLogScale] = useState(false);
  const [records, setRecords] = useState<MinuteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDetector = useMemo(() => {
    return availableDetectors.find((detector) => detector.id === detectorId) ?? availableDetectors[0] ?? null;
  }, [availableDetectors, detectorId]);

  useEffect(() => {
    if (selectedDetector == null) {
      setDetectorId(null);
      return;
    }
    if (detectorId !== selectedDetector.id) {
      setDetectorId(selectedDetector.id);
    }
  }, [detectorId, selectedDetector]);

  const selectedRange = RANGES.find((range) => range.key === rangeKey) ?? DEFAULT_RANGE;

  useEffect(() => {
    if (selectedDetector == null) return;
    let active = true;
    const toTs = Date.now();
    const fromTs = toTs - selectedRange.durationMs;
    setLoading(true);
    setError(null);

    void getDataProvider()
      .then((provider) => provider.getMinuteRecords(selectedDetector.id, { fromTs, toTs }))
      .then((minuteRecords) => {
        if (!active) return;
        setRecords(minuteRecords);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Minute records could not be loaded.");
        setRecords([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedDetector, selectedRange.durationMs]);

  const insights = useMemo<CorrectedRateInsights | null>(() => {
    if (selectedDetector == null || records.length === 0) return null;
    return buildCorrectedRateInsights(records, selectedDetector.hwVersion);
  }, [records, selectedDetector]);

  const spectrum = useMemo<SpectrumModel | null>(() => {
    if (records.length === 0 || selectedDetector == null) return null;
    const amplitudes = records.flatMap((record) => [record.sn, record.sm, record.sx]);
    const thresholdMv = detectorThresholdMv(selectedDetector);
    try {
      const histogram = buildAmplitudeHistogram(amplitudes, {
        binCount: 64,
        thresholdMv: thresholdMv ?? 0,
      });
      return { histogram, mpv: estimateMpv(histogram), thresholdMv };
    } catch (err) {
      if (err instanceof RangeError) return null;
      throw err;
    }
  }, [records, selectedDetector]);

  const primaryMetricLabel = correctedRateMetricLabel(station.type);
  const scientificTooltip = correctedRateTooltip(station.type);

  if (detectors.length === 0) {
    return (
      <Card
        title="Station dashboard"
        empty
        emptyMessage="No detector is registered yet. Register the physical detector, then connect the agent to start collecting data."
      />
    );
  }

  return (
    <section className="grid gap-6" aria-labelledby="station-dashboard-title">
      <Card
        title={
          <span id="station-dashboard-title" className="flex items-center gap-2">
            <Activity size={22} aria-hidden="true" />
            Station dashboard
          </span>
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="m-0 text-base leading-relaxed text-[var(--color-text-secondary)]">
              {primaryMetricLabel}, corrected rate, amplitude spectrum, and statistical insights
              for the selected physical detector.
            </p>
            <p className="mt-3 max-w-[900px] text-sm leading-relaxed text-[var(--color-text-muted)]">
              {scientificTooltip}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="Detector"
              value={selectedDetector?.id ?? ""}
              options={availableDetectors.map((detector) => ({
                value: detector.id,
                label: detector.label ?? detector.hardwareModel,
              }))}
              onChange={setDetectorId}
            />
            <SegmentedControl
              label="Range"
              value={rangeKey}
              options={RANGES.map((range) => ({ value: range.key, label: range.label }))}
              onChange={(value) => setRangeKey(value as RangeKey)}
            />
            <Button
              variant={logScale ? "primary" : "secondary"}
              size="sm"
              onClick={() => setLogScale((current) => !current)}
              icon={<Gauge size={14} aria-hidden="true" />}
            >
              {logScale ? "Log scale on" : "Log scale"}
            </Button>
          </div>
        </div>
      </Card>

      <DashboardBody
        station={station}
        detector={selectedDetector}
        records={records}
        insights={insights}
        spectrum={spectrum}
        loading={loading}
        error={error}
        logScale={logScale}
        rangeLabel={selectedRange.label}
        primaryMetricLabel={primaryMetricLabel}
      />
    </section>
  );
}

function DashboardBody({
  station,
  detector,
  records,
  insights,
  spectrum,
  loading,
  error,
  logScale,
  rangeLabel,
  primaryMetricLabel,
}: {
  readonly station: Station;
  readonly detector: Detector | null;
  readonly records: ReadonlyArray<MinuteRecord>;
  readonly insights: CorrectedRateInsights | null;
  readonly spectrum: SpectrumModel | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly logScale: boolean;
  readonly rangeLabel: string;
  readonly primaryMetricLabel: string;
}): React.ReactElement {
  if (detector == null) {
    return (
      <Card
        title="No detector selected"
        empty
        emptyMessage="Register a detector for this station before opening the dashboard."
      />
    );
  }

  if (loading) {
    return <Card title="Loading detector records" loading />;
  }

  if (error != null) {
    return <Card title="Dashboard unavailable" error={error} />;
  }

  if (records.length === 0 || insights == null) {
    return (
      <Card
        title="No detector data yet"
        empty
        emptyMessage="No minute records are available for this range. Connect the agent to start syncing detector data."
      />
    );
  }

  const latestPoint = insights.points[insights.points.length - 1];
  const collecting = insights.usableBetaSampleCount < DEFAULT_BETA_MIN_POINTS;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          label={primaryMetricLabel}
          value={formatMaybeNumber(latestPoint?.barometricCorrectedRate ?? latestPoint?.deadTimeCorrectedRate)}
          unit="counts / min"
          note={latestPoint?.barometricCorrectedRate == null ? "dead-time corrected" : "dead-time + pressure corrected"}
        />
        <Stat
          label="Pressure"
          value={formatMaybeNumber(latestPoint?.pressureHpa, 1)}
          unit="hPa"
          note={`${rangeLabel} window`}
        />
        <Stat
          label="Beta"
          value={
            insights.beta == null
              ? "collecting"
              : formatMaybeNumber(insights.beta.fit.betaPercentPerHpa, 3)
          }
          unit={insights.beta == null ? "" : "% / hPa"}
          note={insights.beta == null ? `${insights.usableBetaSampleCount}/${DEFAULT_BETA_MIN_POINTS} samples` : `r2 ${formatMaybeNumber(insights.beta.fit.rSquared, 3)}`}
        />
        <Stat
          label="Anomaly flags"
          value={String(insights.anomalies.length)}
          unit=">=3 sigma"
          note={collecting ? "baseline pending" : "minute-level screen"}
        />
      </div>

      {collecting && (
        <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-2)] p-5">
          <div className="flex items-start gap-3">
            <Sigma size={20} className="mt-1 text-[var(--color-warning)]" aria-hidden="true" />
            <div>
              <p className="m-0 text-base font-semibold text-[var(--color-text)]">
                Collecting data for local beta and the robust baseline
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                The dashboard needs about {DEFAULT_BETA_MIN_POINTS.toLocaleString("en-US")} usable
                pressure/rate samples before showing the barometric correction and anomaly band.
                Current usable sample count:{" "}
                <span className="font-mono tabular-nums text-[var(--color-text)]">
                  {insights.usableBetaSampleCount.toLocaleString("en-US")}
                </span>
                .
              </p>
            </div>
          </div>
        </div>
      )}

      <CorrectedRateChart
        stationType={station.type}
        insights={insights}
        logScale={logScale}
        primaryMetricLabel={primaryMetricLabel}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <AmplitudeSpectrumCard spectrum={spectrum} recordCount={records.length} />
        <InsightsPanel insights={insights} collecting={collecting} />
      </div>
    </div>
  );
}

function AmplitudeSpectrumCard({
  spectrum,
  recordCount,
}: {
  readonly spectrum: SpectrumModel | null;
  readonly recordCount: number;
}): React.ReactElement {
  const chart = useMemo(() => (spectrum == null ? null : spectrumChartModel(spectrum)), [spectrum]);

  if (spectrum == null || chart == null) {
    return (
      <Card
        title="Amplitude spectrum"
        empty
        emptyMessage="No usable SiPM amplitude summaries are available in this range."
      />
    );
  }

  return (
    <Card title="Amplitude / deposited energy spectrum">
      <Plot
        data={chart.data}
        layout={chart.layout}
        config={PLOT_CONFIG}
        className="min-h-[380px] w-full"
        style={{ width: "100%", minHeight: "380px" }}
        useResizeHandler
      />
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        Landau-like amplitude distribution from {recordCount.toLocaleString("en-US")} minute
        amplitude summaries. The MPV marks the MIP-scale deposited-energy region near 2 MeV; high
        amplitudes form the Landau tail.
      </p>
    </Card>
  );
}

function InsightsPanel({
  insights,
  collecting,
}: {
  readonly insights: CorrectedRateInsights;
  readonly collecting: boolean;
}): React.ReactElement {
  return (
    <Card title="Insights">
      <div className="grid gap-5">
        <InsightBlock label="Robust baseline">
          {insights.baseline == null ? (
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              Collecting corrected-rate samples before computing the median +/- 1.5 IQR band.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3">
              <Metric label="Median" value={formatMaybeNumber(insights.baseline.median)} unit="counts / min" />
              <Metric label="IQR" value={formatMaybeNumber(insights.baseline.iqr)} unit="counts / min" />
              <Metric label="Lower band" value={formatMaybeNumber(insights.baseline.lower)} unit="counts / min" />
              <Metric label="Upper band" value={formatMaybeNumber(insights.baseline.upper)} unit="counts / min" />
            </dl>
          )}
        </InsightBlock>

        <InsightBlock label="Local beta fit">
          {insights.beta == null ? (
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              Collecting data: {insights.usableBetaSampleCount.toLocaleString("en-US")} /{" "}
              {DEFAULT_BETA_MIN_POINTS.toLocaleString("en-US")} usable samples.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3">
              <Metric label="Beta" value={formatMaybeNumber(insights.beta.fit.betaPercentPerHpa, 3)} unit="% / hPa" />
              <Metric label="r2" value={formatMaybeNumber(insights.beta.fit.rSquared, 3)} unit="" />
              <Metric label="Samples" value={insights.beta.fit.n.toLocaleString("en-US")} unit="" />
              <Metric label="Range" value={formatDateRange(insights.beta.fromTs, insights.beta.toTs)} unit="" />
            </dl>
          )}
        </InsightBlock>

        <InsightBlock label="3-sigma screen">
          {collecting ? (
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              Anomaly flags activate after the local beta and corrected-rate baseline are available.
            </p>
          ) : insights.anomalies.length === 0 ? (
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              No individual-minute samples exceed the 3-sigma screen in this range.
            </p>
          ) : (
            <ul className="m-0 grid max-h-[180px] gap-2 overflow-auto p-0">
              {insights.anomalies.slice(-8).map((anomaly) => (
                <li
                  key={anomaly.ts}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm"
                >
                  <span className="font-mono tabular-nums text-[var(--color-text-secondary)]">
                    {formatDateTime(anomaly.ts)}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--color-warning)]">
                    z={formatMaybeNumber(anomaly.zScore, 2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
            <p className="m-0 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {ANOMALY_DISCLAIMER}
            </p>
          </div>
        </InsightBlock>
      </div>
    </Card>
  );
}

function spectrumChartModel(
  spectrum: SpectrumModel,
): { readonly data: Data[]; readonly layout: Partial<Layout> } {
  const centers = spectrum.histogram.counts.map((_, index) => {
    return (spectrum.histogram.binEdges[index] ?? 0) + spectrum.histogram.binWidthMv / 2;
  });
  const shapes: Array<Partial<Shape>> = [
    {
      type: "line",
      x0: spectrum.mpv,
      x1: spectrum.mpv,
      y0: 0,
      y1: 1,
      yref: "paper",
      line: { color: "var(--color-accent-warm)", width: 2, dash: "dot" },
    },
  ];

  if (spectrum.thresholdMv != null && spectrum.thresholdMv > 0) {
    shapes.push({
      type: "rect",
      x0: 0,
      x1: spectrum.thresholdMv,
      y0: 0,
      y1: 1,
      yref: "paper",
      fillcolor: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
      line: { color: "transparent" },
    });
  }

  return {
    data: [
      {
        type: "bar",
        name: "Amplitude counts",
        x: centers,
        y: [...spectrum.histogram.counts],
        marker: { color: "var(--color-accent)" },
        hovertemplate: "%{x:.1f} mV<br>%{y} summaries<extra></extra>",
      },
    ],
    layout: {
      ...baseLayout({
        title: "Amplitude / deposited energy (Landau, MIP ~2 MeV)",
        yTitle: "Count",
        xTitle: "SiPM amplitude (mV)",
        logScale: false,
        shapes,
      }),
      annotations: [
        {
          x: spectrum.mpv,
          y: 1,
          yref: "paper",
          text: `MPV ${formatMaybeNumber(spectrum.mpv, 1)} mV`,
          showarrow: true,
          arrowcolor: "var(--color-accent-warm)",
          font: { color: "var(--color-text-secondary)", family: "var(--font-mono)", size: 12 },
        },
      ],
    },
  };
}

function baseLayout({
  title,
  yTitle,
  xTitle = "UTC time",
  logScale,
  shapes,
}: {
  readonly title: string;
  readonly yTitle: string;
  readonly xTitle?: string;
  readonly logScale: boolean;
  readonly shapes: ReadonlyArray<Partial<Shape>>;
}): Partial<Layout> {
  return {
    title: { text: title, font: { color: "var(--color-text)", size: 16 } },
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
      title: { text: xTitle, font: { color: "var(--color-text-secondary)" } },
      gridcolor: "color-mix(in srgb, var(--color-border) 55%, transparent)",
      zerolinecolor: "var(--color-border)",
      tickfont: { color: "var(--color-text-secondary)", family: "var(--font-mono)" },
    },
    yaxis: {
      title: { text: yTitle, font: { color: "var(--color-text-secondary)" } },
      type: logScale ? "log" : "linear",
      gridcolor: "color-mix(in srgb, var(--color-border) 55%, transparent)",
      zerolinecolor: "var(--color-border)",
      tickfont: { color: "var(--color-text-secondary)", family: "var(--font-mono)" },
      rangemode: "tozero",
    },
    shapes: [...shapes],
  };
}

function detectorThresholdMv(detector: Detector): number | null {
  const calibration = detector.calibration;
  if (calibration?.triggerAdcMin == null || calibration.adcToMv == null) return null;
  const [slope, intercept] = calibration.adcToMv;
  const threshold = slope * calibration.triggerAdcMin + intercept;
  return Number.isFinite(threshold) && threshold > 0 ? threshold : null;
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div>
      <p className="mb-2 mt-0 font-mono text-xs uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={value === option.value ? "primary" : "secondary"}
            size="sm"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function InsightBlock({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section>
      <h4 className="mb-3 mt-0 flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
        <BarChart3 size={16} aria-hidden="true" />
        {label}
      </h4>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
}): React.ReactElement {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm tabular-nums text-[var(--color-text)]">
        {value}
        {unit !== "" && <span className="ml-1 text-[var(--color-text-secondary)]">{unit}</span>}
      </dd>
    </div>
  );
}

function formatMaybeNumber(value: number | null | undefined, fractionDigits = 2): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(ts));
}

function formatDateRange(fromTs: number, toTs: number): string {
  return `${formatDateTime(fromTs)} - ${formatDateTime(toTs)}`;
}
