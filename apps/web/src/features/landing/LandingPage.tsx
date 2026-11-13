"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowRight, Cpu, Globe2, Zap } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { t } from "@/i18n/t";
import { LIVE_SOURCE, type ParticleEvent } from "./live-feed";
import { clockTime, hourStats, type HourStats } from "./hour-stats";
import { DetectorPanel } from "./DetectorPanel";
import { DetectorsShowcase } from "./DetectorsShowcase";
import { Globe } from "./Globe";
import { CutoffBars, ShowerDiagram } from "./StoryVisuals";
import { replayedMinuteCount, useLiveFeed, type FeedStatus } from "./useLiveFeed";
import { useV5Detectors } from "./useV5Detectors";

const TZ = LIVE_SOURCE.timeZone;

function Eyebrow({ children }: { children: ReactNode }): ReactNode {
  return <p className="font-mono text-sm uppercase tracking-widest text-cosmic">{children}</p>;
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
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${status === "live" ? "bg-brand" : "bg-muted"}`}
      />
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
  const readings = [
    [
      t("landing.live.lastMinute"),
      last === null ? "—" : `${String(last.count)} ± ${String(Math.round(Math.sqrt(last.count)))}`,
    ],
    [t("landing.live.sipm"), fmt(last?.sipmMeanMv, 1, "mV")],
    [t("landing.live.temperature"), fmt(last?.temperatureC, 1, t("unit.celsius"))],
    [t("landing.live.pressure"), fmt(last?.pressureHpa, 1, t("unit.hPa"))],
  ] as const;
  return (
    <div className="rounded-lg border border-border bg-surface/80 px-5 py-4 backdrop-blur-sm">
      <RunningCount recent={feed.recent} delayMs={feed.replayDelayMs} />
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-4">
        {readings.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-accent">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        {t("landing.live.source", {
          time: last === null ? "—" : clockTime(last.start + 60_000, TZ),
        })}
      </p>
    </div>
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

/**
 * The public landing (PUBLIC-SITE-PLAN §1). Sections alternate their style (maintainer, 2026-11-13):
 * the night sky with the planet, real detectors on paper, the network in cosmic indigo, how it works
 * on light grey, the science at night, and joining in the three colours.
 */
export function LandingPage(): ReactNode {
  const feed = useLiveFeed();
  const detectors = useV5Detectors();
  const stats = hourStats(feed.minutes.slice(-60));
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

      <section id="live-data" className="surface-paper scroll-mt-8" aria-labelledby="live-title">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Eyebrow>{t("landing.panel.eyebrow")}</Eyebrow>
          <h2 id="live-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("landing.panel.title")}
          </h2>
          <p className="mt-4 max-w-3xl text-lg text-secondary">{t("landing.panel.intro")}</p>
          <div className="mt-8">
            <DetectorPanel feed={feed} detectors={detectors} />
          </div>
        </div>
      </section>

      <section
        id="detectors"
        className="surface-cosmic scroll-mt-8"
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
          <DetectorsShowcase detectors={detectors} />
          <p className="mt-6 max-w-3xl text-sm text-muted">{t("landing.detectors.where")}</p>
        </div>
      </section>

      <section className="surface-paper bg-surface-2" aria-labelledby="how-title">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Eyebrow>{t("landing.how.eyebrow")}</Eyebrow>
          <h2 id="how-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("landing.how.title")}
          </h2>
          <div className="surface-night mt-10 rounded-2xl p-4 sm:p-8">
            <ShowerDiagram />
          </div>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body, tone }, i) => (
              <li key={title} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
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

      <section className="surface-night" aria-labelledby="equator-title">
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

      <section className="surface-paper" aria-labelledby="join-title">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-2xl bg-gradient-to-br from-accent/20 via-cosmic/20 to-brand/25 p-8 sm:p-12">
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
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-accent bg-surface px-5 py-2 font-medium text-accent"
              >
                {t("landing.network.cta.map")}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
