"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowRight, Cpu, FolderGit2, Globe2, Zap } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { t } from "@/i18n/t";
import { LIVE_SOURCE, type ParticleEvent } from "./live-feed";
import { binMinutes, clockTime, hourStats, type HourStats } from "./hour-stats";
import { Globe } from "./Globe";
import { LineChart, type Point, type Tone } from "./LineChart";
import { EventStream, PulseSpectrum } from "./LiveVisuals";
import { CutoffBars, DetectorTimeline, ShowerDiagram, Sparkline } from "./StoryVisuals";
import { replayedMinuteCount, useLiveFeed, type FeedStatus } from "./useLiveFeed";
import { useV5Detectors } from "./useV5Detectors";
import type { V5Detector } from "./v5-detectors";

const REPO_URL = "https://github.com/alexanderkholodov1/MuonHub";
const TZ = LIVE_SOURCE.timeZone;
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TZ,
});

const RANGES = [
  { minutes: 60, bin: 1, label: "1 h" },
  { minutes: 360, bin: 5, label: "6 h" },
  { minutes: 1_440, bin: 15, label: "24 h" },
] as const;

function Eyebrow({ children }: { children: ReactNode }): ReactNode {
  return <p className="font-mono text-sm uppercase tracking-widest text-cosmic">{children}</p>;
}

function Dot({ on }: { on: boolean }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${on ? "bg-brand" : "bg-muted"}`}
    />
  );
}

function StatusLine({
  status,
  newestEventTs,
}: {
  status: FeedStatus;
  newestEventTs: number | null;
}): ReactNode {
  const text =
    status === "live"
      ? t("landing.status.live", { place: LIVE_SOURCE.place })
      : status === "quiet"
        ? newestEventTs === null
          ? t("landing.status.quietNever")
          : t("landing.status.quiet", { time: clockTime(newestEventTs, TZ) })
        : status === "unavailable"
          ? t("landing.status.unavailable")
          : t("landing.status.connecting");
  return (
    <p className="flex items-center gap-2 font-mono text-sm text-secondary">
      <Dot on={status === "live"} />
      {text}
    </p>
  );
}

/** Counts the replayed detections of the current minute, ticking with the particles on the globe. */
function RunningCount({
  recent,
  delayMs,
}: {
  recent: RefObject<ParticleEvent[]>;
  delayMs: number | null;
}): ReactNode {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const running = replayedMinuteCount(recent.current, delayMs, now);
  return (
    <div className="flex items-baseline gap-4">
      <span className="min-w-[3ch] font-mono text-5xl font-semibold tabular-nums text-brand">
        {running === null ? "—" : running.count}
      </span>
      <span className="text-base text-secondary">
        {running === null
          ? t("landing.live.countWaiting")
          : t("landing.live.count", { time: clockTime(running.minuteStart, TZ) })}
      </span>
    </div>
  );
}

function Reading({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg tabular-nums text-accent">{value}</dd>
    </div>
  );
}

/** munhub-lab's readout for the live detector: events per minute, SiPM, temperature, pressure. */
function LivePanel({
  feed,
  stats,
}: {
  feed: ReturnType<typeof useLiveFeed>;
  stats: HourStats | null;
}): ReactNode {
  const last = stats?.last ?? null;
  const fmt = (v: number | null | undefined, digits: number, unit: string): string =>
    v === null || v === undefined ? "—" : `${v.toFixed(digits)} ${unit}`;
  return (
    <div className="rounded-lg border border-border bg-surface/80 px-5 py-4 backdrop-blur-sm">
      <RunningCount recent={feed.recent} delayMs={feed.replayDelayMs} />
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-4">
        <Reading
          label={t("landing.live.lastMinute")}
          value={
            last === null
              ? "—"
              : `${String(last.count)} ± ${String(Math.round(Math.sqrt(last.count)))}`
          }
        />
        <Reading label={t("landing.live.sipm")} value={fmt(last?.sipmMeanMv, 1, "mV")} />
        <Reading
          label={t("landing.live.temperature")}
          value={fmt(last?.temperatureC, 1, t("unit.celsius"))}
        />
        <Reading
          label={t("landing.live.pressure")}
          value={fmt(last?.pressureHpa, 1, t("unit.hPa"))}
        />
      </dl>
      <p className="mt-3 text-xs text-muted">
        {t("landing.live.source", {
          time: last === null ? "—" : clockTime(last.start + 60_000, TZ),
        })}
      </p>
    </div>
  );
}

function ChartCard({
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
  const toneText =
    tone === "accent" ? "text-accent" : tone === "brand" ? "text-brand" : "text-cosmic";
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className={`font-mono text-lg tabular-nums ${toneText}`}>{now}</span>
      </div>
      {children}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: Tone }): ReactNode {
  const toneText =
    tone === "accent" ? "text-accent" : tone === "brand" ? "text-brand" : "text-cosmic";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl tabular-nums ${toneText}`}>{value}</dd>
    </div>
  );
}

/** munhub-lab's four charts, over 1, 6 or 24 hours, with the hour's statistics and the spectrum. */
function LiveData({ feed }: { feed: ReturnType<typeof useLiveFeed> }): ReactNode {
  const [rangeIndex, setRangeIndex] = useState(0);
  const range = RANGES[rangeIndex] ?? RANGES[0];
  const stats = hourStats(feed.minutes.slice(-60));
  if (stats === null) {
    return (
      <p className="rounded-xl border border-border bg-surface p-6 text-secondary" role="status">
        {feed.status === "unavailable" ? t("landing.hour.unavailable") : t("landing.hour.loading")}
      </p>
    );
  }
  const binned = binMinutes(feed.minutes.slice(-range.minutes), range.bin);
  const binMs = range.bin * 60_000;
  const nowOf = (points: Point[], digits: number, unit: string): string => {
    const p = points.at(-1);
    return p === undefined ? "—" : `${p.v.toFixed(digits)} ${unit}`;
  };
  const rateNow = binned.rate.at(-1);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-secondary">{t("landing.charts.intro")}</p>
        <div
          className="flex rounded-lg border border-border p-1"
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
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
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
            binMs={binMs}
            timeZone={TZ}
            digits={1}
            unit={t("landing.charts.perMinute")}
            label={t("landing.hour.chartLabel", {
              count: stats.minutes,
              min: stats.min,
              max: stats.max,
              mean: stats.mean.toFixed(1),
            })}
          />
        </ChartCard>
        <ChartCard title={t("landing.charts.sipm")} tone="cosmic" now={nowOf(binned.sipm, 2, "mV")}>
          <LineChart
            points={binned.sipm}
            tone="cosmic"
            binMs={binMs}
            timeZone={TZ}
            digits={2}
            unit="mV"
            label={t("landing.charts.sipm")}
            minSpan={2}
          />
        </ChartCard>
        <ChartCard
          title={t("landing.charts.temperature")}
          tone="brand"
          now={nowOf(binned.temperature, 1, t("unit.celsius"))}
        >
          <LineChart
            points={binned.temperature}
            tone="brand"
            binMs={binMs}
            timeZone={TZ}
            digits={1}
            unit={t("unit.celsius")}
            label={t("landing.charts.temperature")}
            minSpan={2}
          />
        </ChartCard>
        <ChartCard
          title={t("landing.charts.pressure")}
          tone="accent"
          now={nowOf(binned.pressure, 1, t("unit.hPa"))}
        >
          <LineChart
            points={binned.pressure}
            tone="accent"
            binMs={binMs}
            timeZone={TZ}
            digits={1}
            unit={t("unit.hPa")}
            label={t("landing.charts.pressure")}
            minSpan={3}
          />
        </ChartCard>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label={t("landing.hour.average")}
          value={`${stats.mean.toFixed(1)} ± ${stats.meanUncertainty.toFixed(1)}`}
          tone="accent"
        />
        <Tile
          label={t("landing.hour.recorded")}
          value={t("landing.hour.recordedValue", { count: stats.minutes })}
          tone="cosmic"
        />
        <Tile label={t("landing.hour.lowest")} value={String(stats.min)} tone="brand" />
        <Tile label={t("landing.hour.highest")} value={String(stats.max)} tone="brand" />
      </dl>
      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="rounded-xl border border-cosmic/40 bg-cosmic/10 p-6">
          <h3 className="text-xl font-semibold">{t("landing.hour.whyTitle")}</h3>
          <p className="mt-3 text-secondary">
            {t("landing.hour.why", {
              mean: Math.round(stats.mean),
              spread: Math.round(stats.chanceSpread),
            })}
          </p>
          <p className="mt-4 text-sm text-muted">{t("landing.hour.honest")}</p>
        </div>
        <ChartCard
          title={t("landing.spectrum.title")}
          tone="cosmic"
          now={t("landing.spectrum.unit")}
        >
          <PulseSpectrum label={t("landing.spectrum.label")} />
          <p className="mt-3 text-sm text-secondary">{t("landing.spectrum.caption")}</p>
        </ChartCard>
      </div>
    </>
  );
}

function DetectorCard({ d }: { d: V5Detector }): ReactNode {
  return (
    <li
      className={`rounded-xl border bg-surface p-4 ${d.live ? "border-accent shadow-[0_0_24px_-8px_var(--color-accent)]" : "border-border"}`}
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
        <Dot on={d.live} />
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

const STEPS = [
  {
    icon: Zap,
    title: "landing.how.detector.title",
    body: "landing.how.detector.body",
    tone: "text-accent",
  },
  {
    icon: Cpu,
    title: "landing.how.agent.title",
    body: "landing.how.agent.body",
    tone: "text-cosmic",
  },
  {
    icon: Globe2,
    title: "landing.how.open.title",
    body: "landing.how.open.body",
    tone: "text-brand",
  },
] as const;

/** The public landing (PUBLIC-SITE-PLAN §1): the planet and the live detector first, then MuonHub. */
export function LandingPage(): ReactNode {
  const feed = useLiveFeed();
  const detectors = useV5Detectors();
  const stats = hourStats(feed.minutes.slice(-60));
  const list = detectors.status === "ready" ? detectors.data : [];
  const liveCount = list.filter((d) => d.live).length;
  const [now] = useState(() => Date.now());

  return (
    <div className="surface-night">
      <div className="relative isolate overflow-hidden">
        <SiteHeader overlay />
        <main id="main">
          <section
            className="mx-auto grid max-w-6xl items-center gap-6 px-6 pb-12 lg:min-h-[calc(100svh-4.5rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8 lg:pb-6"
            aria-labelledby="hero-title"
          >
            <div className="order-2 lg:order-1">
              <StatusLine status={feed.status} newestEventTs={feed.newestEventTs} />
              <h1
                id="hero-title"
                className="mt-2 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-[2.75rem]"
              >
                {t("landing.hero.titleStart")}{" "}
                <span className="bg-gradient-to-r from-accent via-cosmic to-brand bg-clip-text text-transparent">
                  {t("landing.hero.titleEnd")}
                </span>
              </h1>
              <p className="mt-3 max-w-xl text-lg text-secondary">{t("landing.hero.lead")}</p>
              <div className="mt-5">
                <LivePanel feed={feed} stats={stats} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href="#live-data"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 py-2 font-medium text-on-brand"
                >
                  {t("landing.hero.cta.lastHour")}
                  <ArrowDown size={18} aria-hidden="true" />
                </a>
                <a
                  href="#detectors"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-brand px-5 py-2 font-medium text-brand"
                >
                  {t("landing.hero.cta.detectors")}
                  <ArrowDown size={18} aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="mx-auto aspect-square h-[44svh] max-h-[600px] max-w-full lg:h-[min(80svh,600px)]">
                <Globe
                  queue={feed.queue}
                  replayDelayMs={feed.replayDelayMs}
                  detectors={Math.max(list.length, 1)}
                  liveDetectors={feed.status === "live" ? 1 : 0}
                  label={t("landing.globe.label")}
                  sublabel={
                    list.length > 0
                      ? t("landing.globe.sublabel", { count: list.length, live: liveCount })
                      : LIVE_SOURCE.station
                  }
                />
              </div>
              <p className="mx-auto mt-2 max-w-md text-center text-xs text-muted">
                {t("landing.globe.caption")}
              </p>
            </div>
          </section>
        </main>
      </div>

      <section
        id="live-data"
        className="scroll-mt-8 border-t border-border"
        aria-labelledby="live-title"
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Eyebrow>{t("landing.hour.eyebrow")}</Eyebrow>
          <h2 id="live-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("landing.stream.title")}
          </h2>
          <div className="mt-8 rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-secondary">{t("landing.stream.intro")}</p>
              <p className="flex gap-4 font-mono text-xs">
                <span className="text-accent">{t("landing.stream.small")}</span>
                <span className="text-cosmic">{t("landing.stream.medium")}</span>
                <span className="text-brand">{t("landing.stream.large")}</span>
              </p>
            </div>
            <EventStream
              recent={feed.recent}
              replayDelayMs={feed.replayDelayMs}
              label={t("landing.stream.label")}
            />
          </div>
          <div className="mt-10">
            <LiveData feed={feed} />
          </div>
        </div>
      </section>

      <section
        id="detectors"
        className="scroll-mt-8 border-t border-border bg-surface/40"
        aria-labelledby="detectors-title"
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Eyebrow>{t("landing.detectors.eyebrow")}</Eyebrow>
          <h2
            id="detectors-title"
            className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {t("landing.detectors.title")}
          </h2>
          <p className="mt-4 max-w-3xl text-secondary">{t("landing.detectors.intro")}</p>
          {detectors.status === "ready" ? (
            <>
              <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((d) => (
                  <DetectorCard key={d.key} d={d} />
                ))}
              </ul>
              <div className="mt-6">
                <DetectorTimeline detectors={list} now={now} />
              </div>
            </>
          ) : (
            <p className="mt-10 text-secondary" role="status">
              {detectors.status === "error"
                ? t("landing.detectors.unavailable")
                : t("landing.detectors.loading")}
            </p>
          )}
          <p className="mt-6 max-w-3xl text-sm text-muted">{t("landing.detectors.where")}</p>
        </div>
      </section>

      <section className="border-t border-border" aria-labelledby="how-title">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Eyebrow>{t("landing.how.eyebrow")}</Eyebrow>
          <h2 id="how-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("landing.how.title")}
          </h2>
          <div className="mt-10 rounded-xl border border-border bg-surface p-4 sm:p-8">
            <ShowerDiagram />
          </div>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body, tone }, i) => (
              <li key={title}>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm ${tone}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Icon size={22} strokeWidth={1.75} className={tone} aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-xl font-semibold">{t(title)}</h3>
                <p className="mt-2 text-secondary">{t(body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border bg-surface/40" aria-labelledby="equator-title">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[3fr_2fr]">
          <div>
            <Eyebrow>{t("landing.equator.eyebrow")}</Eyebrow>
            <h2
              id="equator-title"
              className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              {t("landing.equator.title")}
            </h2>
            <p className="mt-6 text-lg text-secondary">{t("landing.equator.body1")}</p>
            <p className="mt-4 text-lg text-secondary">{t("landing.equator.body2")}</p>
          </div>
          <CutoffBars />
        </div>
      </section>

      <section className="border-t border-border" aria-labelledby="join-title">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-accent/15 via-cosmic/15 to-brand/15 p-8 sm:p-12">
            <Eyebrow>{t("landing.network.eyebrow")}</Eyebrow>
            <h2 id="join-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("landing.network.title")}
            </h2>
            <p className="mt-4 max-w-3xl text-lg text-secondary">{t("landing.network.body")}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-fill px-5 py-2 font-medium text-on-brand"
              >
                {t("landing.network.cta.join")}
              </Link>
              <Link
                href="/network"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-accent px-5 py-2 font-medium text-accent"
              >
                {t("landing.network.cta.map")}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-3 px-6 py-12 text-sm text-secondary">
          <p className="flex items-center gap-2 text-base text-text">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-brand" />
            {t("landing.footer.about")}
          </p>
          <p>{t("landing.footer.origin")}</p>
          <p>
            <a className="inline-flex items-center gap-2 underline" href={REPO_URL}>
              <FolderGit2 size={16} aria-hidden="true" />
              {t("landing.footer.source")}
            </a>
          </p>
          <p className="text-muted">{t("landing.footer.dataNote")}</p>
        </div>
      </footer>
    </div>
  );
}
