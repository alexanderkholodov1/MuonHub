"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowRight, Cpu, FolderGit2, Globe2, Zap } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { t } from "@/i18n/t";
import { LIVE_SOURCE, type MinuteRecord, type ParticleEvent } from "./live-feed";
import { clockTime, hourStats, type HourStats } from "./hour-stats";
import { Globe } from "./Globe";
import { LastHourChart } from "./LastHourChart";
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
      <dd className="mt-1 font-mono text-lg tabular-nums">{value}</dd>
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

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="mt-1 font-mono text-xl tabular-nums">{value}</dd>
    </div>
  );
}

function LastHour({
  status,
  stats,
  minutes,
}: {
  status: FeedStatus;
  stats: HourStats | null;
  minutes: readonly MinuteRecord[];
}): ReactNode {
  if (stats === null) {
    return (
      <p className="rounded-lg border border-border bg-surface p-6 text-secondary" role="status">
        {status === "unavailable" ? t("landing.hour.unavailable") : t("landing.hour.loading")}
      </p>
    );
  }
  return (
    <>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-2 text-sm text-secondary">{t("landing.hour.axis")}</p>
        <LastHourChart
          minutes={minutes}
          stats={stats}
          timeZone={TZ}
          label={t("landing.hour.chartLabel", {
            count: stats.minutes,
            min: stats.min,
            max: stats.max,
            mean: stats.mean.toFixed(1),
          })}
        />
      </div>
      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("landing.hour.average")}
          value={`${stats.mean.toFixed(1)} ± ${stats.meanUncertainty.toFixed(1)}`}
        />
        <Stat
          label={t("landing.hour.recorded")}
          value={t("landing.hour.recordedValue", { count: stats.minutes })}
        />
        <Stat label={t("landing.hour.lowest")} value={String(stats.min)} />
        <Stat label={t("landing.hour.highest")} value={String(stats.max)} />
      </dl>
      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_3fr]">
        <div>
          <h3 className="text-xl font-semibold">{t("landing.hour.whyTitle")}</h3>
          <p className="mt-2 text-secondary">
            {t("landing.hour.why", {
              mean: Math.round(stats.mean),
              spread: Math.round(stats.chanceSpread),
            })}
          </p>
        </div>
        <p className="text-sm text-secondary lg:pt-9">{t("landing.hour.honest")}</p>
      </div>
    </>
  );
}

function DetectorCard({ d }: { d: V5Detector }): ReactNode {
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-lg font-semibold">{d.name}</p>
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
  { icon: Zap, title: "landing.how.detector.title", body: "landing.how.detector.body" },
  { icon: Cpu, title: "landing.how.agent.title", body: "landing.how.agent.body" },
  { icon: Globe2, title: "landing.how.open.title", body: "landing.how.open.body" },
] as const;

/** The public landing (PUBLIC-SITE-PLAN §1): the planet and the live detector first, then MuonHub. */
export function LandingPage(): ReactNode {
  const feed = useLiveFeed();
  const detectors = useV5Detectors();
  const stats = hourStats(feed.minutes);
  const list = detectors.status === "ready" ? detectors.data : [];
  const liveCount = list.filter((d) => d.live).length;

  return (
    <>
      <div className="surface-night relative isolate overflow-hidden">
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
                {t("landing.hero.title")}
              </h1>
              <p className="mt-3 max-w-xl text-lg text-secondary">{t("landing.hero.lead")}</p>
              <div className="mt-5">
                <LivePanel feed={feed} stats={stats} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href="#last-hour"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-fill px-5 py-2 font-medium text-on-brand"
                >
                  {t("landing.hero.cta.lastHour")}
                  <ArrowDown size={18} aria-hidden="true" />
                </a>
                <a
                  href="#detectors"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-5 py-2 font-medium"
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
        id="last-hour"
        className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24"
        aria-labelledby="hour-title"
      >
        <Eyebrow>{t("landing.hour.eyebrow")}</Eyebrow>
        <h2 id="hour-title" className="mt-2 text-3xl font-semibold tracking-tight">
          {t("landing.hour.title")}
        </h2>
        <p className="mt-4 max-w-3xl text-secondary">{t("landing.hour.intro")}</p>
        <div className="mt-8">
          <LastHour status={feed.status} stats={stats} minutes={feed.minutes} />
        </div>
      </section>

      <section
        id="detectors"
        className="scroll-mt-8 border-y border-border bg-surface"
        aria-labelledby="detectors-title"
      >
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Eyebrow>{t("landing.detectors.eyebrow")}</Eyebrow>
          <h2 id="detectors-title" className="mt-2 text-3xl font-semibold tracking-tight">
            {t("landing.detectors.title")}
          </h2>
          <p className="mt-4 max-w-3xl text-secondary">{t("landing.detectors.intro")}</p>
          {detectors.status === "ready" ? (
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((d) => (
                <DetectorCard key={d.key} d={d} />
              ))}
            </ul>
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

      <section className="mx-auto max-w-6xl px-6 py-24" aria-labelledby="how-title">
        <Eyebrow>{t("landing.how.eyebrow")}</Eyebrow>
        <h2 id="how-title" className="mt-2 text-3xl font-semibold tracking-tight">
          {t("landing.how.title")}
        </h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-cosmic">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon size={22} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-xl font-semibold">{t(title)}</h3>
              <p className="mt-2 text-secondary">{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-surface" aria-labelledby="equator-title">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[3fr_2fr]">
          <div>
            <Eyebrow>{t("landing.equator.eyebrow")}</Eyebrow>
            <h2 id="equator-title" className="mt-2 text-3xl font-semibold tracking-tight">
              {t("landing.equator.title")}
            </h2>
            <p className="mt-6 text-lg text-secondary">{t("landing.equator.body1")}</p>
            <p className="mt-4 text-lg text-secondary">{t("landing.equator.body2")}</p>
          </div>
          <dl className="grid content-start gap-4">
            {(
              [
                ["≈ 12–13 GV", "landing.equator.cutoff"],
                ["≈ 1 GV", "landing.equator.poles"],
                ["≈ 2,400 m", "landing.equator.altitude"],
              ] as const
            ).map(([value, label]) => (
              <div key={label} className="rounded-lg border border-border bg-bg p-4">
                <dt className="text-sm text-secondary">{t(label)}</dt>
                <dd className="mt-1 font-mono text-2xl tabular-nums text-brand">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24" aria-labelledby="join-title">
        <Eyebrow>{t("landing.network.eyebrow")}</Eyebrow>
        <h2 id="join-title" className="mt-2 text-3xl font-semibold tracking-tight">
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
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-5 py-2 font-medium"
          >
            {t("landing.network.cta.map")}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="surface-night border-t border-border">
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
    </>
  );
}
