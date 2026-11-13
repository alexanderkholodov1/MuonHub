"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { t } from "@/i18n/t";
import { fetchSessionMinutes, LIVE_SOURCE, type MinuteRecord } from "./live-feed";
import { binMinutes, hourStats } from "./hour-stats";
import { LineChart, type Point, type Tone } from "./LineChart";
import { EventStream, PulseSpectrum } from "./LiveVisuals";
import type { LiveFeed } from "./useLiveFeed";
import type { DetectorsState } from "./useV5Detectors";
import type { V5Detector } from "./v5-detectors";

const MUNHUB_LAB = "https://munhub-lab.web.app/";
const TZ = LIVE_SOURCE.timeZone;
const LIVE_KEY = "leopard_test";
const RANGES = [
  { minutes: 60, bin: 1, label: "1 h" },
  { minutes: 360, bin: 5, label: "6 h" },
  { minutes: 1_440, bin: 15, label: "24 h" },
] as const;
const stamp = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

type Loaded =
  { status: "loading" } | { status: "ready"; minutes: MinuteRecord[] } | { status: "error" };

/** The last recorded day of a historical detector, read once per detector and kept. */
function useSessionMinutes(detector: V5Detector | null): Loaded {
  const cache = useRef(new Map<string, MinuteRecord[]>());
  const [state, setState] = useState<Loaded>({ status: "loading" });
  useEffect(() => {
    if (detector === null || detector.lastSession === null) {
      setState({ status: "ready", minutes: [] });
      return;
    }
    const cached = cache.current.get(detector.key);
    if (cached !== undefined) {
      setState({ status: "ready", minutes: cached });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchSessionMinutes(detector.key, detector.lastSession, 1_440, controller.signal)
      .then((minutes) => {
        cache.current.set(detector.key, minutes);
        if (!controller.signal.aborted) setState({ status: "ready", minutes });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [detector]);
  return state;
}

function toneText(tone: Tone): string {
  return tone === "accent" ? "text-accent" : tone === "brand" ? "text-brand" : "text-cosmic";
}

function Card({
  title,
  now,
  tone,
  children,
}: {
  title: string;
  now: string;
  tone: Tone;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className={`whitespace-nowrap font-mono text-lg tabular-nums ${toneText(tone)}`}>
          {now}
        </span>
      </div>
      {children}
    </div>
  );
}

function Reading({ label, value, tone }: { label: string; value: string; tone: Tone }): ReactNode {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-1 font-mono text-lg tabular-nums ${toneText(tone)}`}>{value}</dd>
    </div>
  );
}

const last = (points: Point[]): Point | undefined => points.at(-1);
const show = (p: Point | undefined, digits: number, unit: string): string =>
  p === undefined ? "—" : `${p.v.toFixed(digits)} ${unit}`;

/**
 * munhub-lab, simplified: choose one of its public detectors and see its readings and charts, drawn
 * from what it recorded. The live detector is shown live (1, 6 or 24 h, plus every particle as it
 * arrives and its pulse sizes); the others show their last recorded day.
 */
export function DetectorPanel({
  feed,
  detectors,
}: {
  feed: LiveFeed;
  detectors: DetectorsState;
}): ReactNode {
  const list =
    detectors.status === "ready"
      ? detectors.data.filter((d) => d.live || d.lastSession !== null)
      : [];
  const [selectedKey, setSelectedKey] = useState<string>(LIVE_KEY);
  const [rangeIndex, setRangeIndex] = useState(0);
  const selected = list.find((d) => d.key === selectedKey) ?? null;
  const isLive = selectedKey === LIVE_KEY;
  const historical = useSessionMinutes(isLive ? null : selected);
  const range = RANGES[rangeIndex] ?? RANGES[0];

  const minutes: MinuteRecord[] | null = isLive
    ? feed.minutes.length > 0
      ? feed.minutes.slice(-range.minutes)
      : null
    : historical.status === "ready"
      ? historical.minutes
      : null;
  const span =
    minutes !== null && minutes.length > 1
      ? ((minutes.at(-1)?.start ?? 0) - (minutes[0]?.start ?? 0)) / 60_000
      : 0;
  const bin = isLive ? range.bin : span <= 90 ? 1 : span <= 400 ? 5 : 15;
  const binned = minutes === null ? null : binMinutes(minutes, bin);
  const record = minutes?.at(-1) ?? null;
  const name = selected?.name ?? "LEOPARD-TEST";
  const hour = isLive ? hourStats(feed.minutes.slice(-60)) : null;
  const rateNow = binned === null ? undefined : last(binned.rate);
  const sipmMax =
    minutes === null
      ? null
      : Math.max(0, ...minutes.flatMap((m) => (m.sipmMaxMv === null ? [] : [m.sipmMaxMv])));

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("landing.panel.choose")}
      >
        {(list.length > 0 ? list : []).map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={d.key === selectedKey}
            onClick={() => setSelectedKey(d.key)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 font-mono text-sm ${
              d.key === selectedKey
                ? "border-accent bg-accent text-bg"
                : "border-border bg-surface text-text"
            }`}
          >
            {d.live && (
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-brand" />
            )}
            {d.name}
          </button>
        ))}
        <a
          href={MUNHUB_LAB}
          className="ml-auto inline-flex min-h-10 items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("landing.panel.open")}
          <ExternalLink size={16} aria-hidden="true" />
        </a>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-7">
          <Reading
            label={t("landing.panel.events")}
            value={
              record === null
                ? "—"
                : `${String(record.count)} ± ${String(Math.round(Math.sqrt(record.count)))}`
            }
            tone="accent"
          />
          <Reading
            label={t("landing.panel.sipmAvg")}
            value={record?.sipmMeanMv == null ? "—" : `${record.sipmMeanMv.toFixed(1)} mV`}
            tone="cosmic"
          />
          <Reading
            label={t("landing.panel.temp")}
            value={
              record?.temperatureC == null
                ? "—"
                : `${record.temperatureC.toFixed(1)} ${t("unit.celsius")}`
            }
            tone="brand"
          />
          <Reading
            label={t("landing.panel.pressure")}
            value={
              record?.pressureHpa == null
                ? "—"
                : `${record.pressureHpa.toFixed(1)} ${t("unit.hPa")}`
            }
            tone="accent"
          />
          <Reading
            label={t("landing.panel.deadTime")}
            value={
              record?.deadTimePct == null
                ? "—"
                : `${record.deadTimePct.toFixed(3)} ${t("unit.percent")}`
            }
            tone="cosmic"
          />
          <Reading
            label={t("landing.panel.lastUpdate")}
            value={record === null ? "—" : stamp.format(record.start + 60_000)}
            tone="brand"
          />
          <Reading label={t("landing.panel.profile")} value={name} tone="accent" />
        </dl>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-secondary">
          {isLive
            ? t("landing.panel.range", { count: minutes?.length ?? 0 })
            : record === null
              ? ""
              : t("landing.panel.recordedDay", { date: stamp.format(record.start + 60_000) })}
        </p>
        {isLive && (
          <div
            className="flex rounded-lg border border-border bg-surface p-1"
            role="group"
            aria-label={t("landing.charts.range")}
          >
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                type="button"
                aria-pressed={i === rangeIndex}
                onClick={() => setRangeIndex(i)}
                className={`min-h-9 rounded-md px-4 font-mono text-sm ${i === rangeIndex ? "bg-accent text-bg" : "text-secondary"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {binned === null ? (
        <p
          className="mt-6 rounded-xl border border-border bg-surface p-6 text-secondary"
          role="status"
        >
          {historical.status === "error" || feed.status === "unavailable"
            ? t("landing.hour.unavailable")
            : t("landing.panel.loading")}
        </p>
      ) : binned.rate.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-surface p-6 text-secondary">
          {t("landing.panel.noData")}
        </p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card
            title={t("landing.charts.rate")}
            tone="accent"
            now={
              rateNow === undefined
                ? "—"
                : `${rateNow.v.toFixed(0)} ± ${(((rateNow.hi ?? rateNow.v) - (rateNow.lo ?? rateNow.v)) / 2).toFixed(0)}`
            }
          >
            <LineChart
              points={binned.rate}
              tone="accent"
              binMs={bin * 60_000}
              timeZone={TZ}
              digits={1}
              unit={t("landing.charts.perMinute")}
              label={
                hour === null
                  ? t("landing.charts.rate")
                  : t("landing.hour.chartLabel", {
                      count: hour.minutes,
                      min: hour.min,
                      max: hour.max,
                      mean: hour.mean.toFixed(1),
                    })
              }
            />
          </Card>
          <Card
            title={t("landing.charts.sipm")}
            tone="cosmic"
            now={
              sipmMax === null || sipmMax === 0
                ? show(last(binned.sipm), 2, "mV")
                : t("landing.charts.sipmMax", { value: sipmMax.toFixed(1) })
            }
          >
            <LineChart
              points={binned.sipm}
              tone="cosmic"
              binMs={bin * 60_000}
              timeZone={TZ}
              digits={2}
              unit="mV"
              label={t("landing.charts.sipm")}
              minSpan={2}
            />
          </Card>
          <Card
            title={`${t("landing.charts.temperature")} · ${t("landing.charts.pressure")}`}
            tone="brand"
            now={show(last(binned.temperature), 1, t("unit.celsius"))}
          >
            <LineChart
              points={binned.temperature}
              tone="brand"
              height={110}
              binMs={bin * 60_000}
              timeZone={TZ}
              digits={1}
              unit={t("unit.celsius")}
              label={t("landing.charts.temperature")}
              minSpan={2}
            />
            <p className="mt-2 text-right font-mono text-sm text-accent">
              {show(last(binned.pressure), 1, t("unit.hPa"))}
            </p>
            <LineChart
              points={binned.pressure}
              tone="accent"
              height={110}
              binMs={bin * 60_000}
              timeZone={TZ}
              digits={1}
              unit={t("unit.hPa")}
              label={t("landing.charts.pressure")}
              minSpan={3}
            />
          </Card>
          <Card
            title={t("landing.charts.deadTime")}
            tone="cosmic"
            now={show(last(binned.deadTime), 3, t("unit.percent"))}
          >
            <LineChart
              points={binned.deadTime}
              tone="cosmic"
              binMs={bin * 60_000}
              timeZone={TZ}
              digits={3}
              unit={t("unit.percent")}
              label={t("landing.charts.deadTime")}
            />
          </Card>
        </div>
      )}

      {isLive && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold">{t("landing.stream.title", { name })}</h3>
              <p className="flex gap-4 font-mono text-xs">
                <span className="text-accent">{t("landing.stream.small")}</span>
                <span className="text-cosmic">{t("landing.stream.medium")}</span>
                <span className="text-brand">{t("landing.stream.large")}</span>
              </p>
            </div>
            <p className="mb-3 text-sm text-secondary">{t("landing.stream.intro")}</p>
            <EventStream
              recent={feed.recent}
              replayDelayMs={feed.replayDelayMs}
              label={t("landing.stream.label")}
            />
          </div>
          <Card title={t("landing.spectrum.title")} tone="cosmic" now={t("landing.spectrum.unit")}>
            <PulseSpectrum label={t("landing.spectrum.label")} />
            <p className="mt-3 text-sm text-secondary">{t("landing.spectrum.caption")}</p>
          </Card>
        </div>
      )}

      {hour !== null && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
          <dl className="grid grid-cols-2 gap-4">
            {(
              [
                [
                  t("landing.hour.average"),
                  `${hour.mean.toFixed(1)} ± ${hour.meanUncertainty.toFixed(1)}`,
                  "accent",
                ],
                [
                  t("landing.hour.recorded"),
                  t("landing.hour.recordedValue", { count: hour.minutes }),
                  "cosmic",
                ],
                [t("landing.hour.lowest"), String(hour.min), "brand"],
                [t("landing.hour.highest"), String(hour.max), "brand"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <dt className="text-sm text-secondary">{label}</dt>
                <dd className={`mt-1 font-mono text-2xl tabular-nums ${toneText(tone)}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="rounded-xl border border-cosmic/40 bg-cosmic/10 p-6">
            <h3 className="text-lg font-semibold">{t("landing.hour.whyTitle")}</h3>
            <p className="mt-2 text-secondary">
              {t("landing.hour.why", {
                mean: Math.round(hour.mean),
                spread: Math.round(hour.chanceSpread),
              })}
            </p>
            <p className="mt-3 text-sm text-muted">{t("landing.hour.honest")}</p>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">{t("landing.footer.dataNote")}</p>
    </div>
  );
}
