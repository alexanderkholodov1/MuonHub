"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, Cpu, FolderGit2, Globe2, Zap } from "lucide-react";
import { t } from "@/i18n/t";
import { LIVE_SOURCE } from "./live-feed";
import { clockTime, hourStats, type HourStats } from "./hour-stats";
import { LastHourChart } from "./LastHourChart";
import { ParticleField } from "./ParticleField";
import { useLiveFeed, type FeedStatus } from "./useLiveFeed";

const REPO_URL = "https://github.com/alexanderkholodov1/MuonHub";

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
          : t("landing.status.quiet", { time: clockTime(newestEventTs, LIVE_SOURCE.timeZone) })
        : status === "unavailable"
          ? t("landing.status.unavailable")
          : t("landing.status.connecting");
  return (
    <p className="flex items-center gap-2 font-mono text-sm text-secondary">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${status === "live" ? "bg-accent-warm" : "bg-muted"}`}
      />
      {text}
    </p>
  );
}

function Readout({ stats }: { stats: HourStats | null }): ReactNode {
  if (stats === null) {
    return <p className="font-mono text-base text-secondary">{t("landing.hero.readoutWaiting")}</p>;
  }
  const { count, start } = stats.last;
  return (
    <div className="inline-flex flex-col rounded-lg border border-border bg-surface/80 px-6 py-4 backdrop-blur-sm">
      <p className="flex items-baseline gap-3">
        <span className="font-mono text-5xl font-semibold tabular-nums">{count}</span>
        <span className="font-mono text-base text-secondary">
          {t("landing.hero.readoutChance", { sigma: Math.round(Math.sqrt(count)) })}
        </span>
      </p>
      <p className="mt-1 text-sm text-secondary">
        {t("landing.hero.readoutLabel", {
          time: clockTime(start + 60_000, LIVE_SOURCE.timeZone),
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
  minutes: Parameters<typeof LastHourChart>[0]["minutes"];
}): ReactNode {
  if (stats === null) {
    return (
      <p className="rounded-lg border border-border bg-surface p-6 text-secondary" role="status">
        {status === "unavailable" ? t("landing.hour.unavailable") : t("landing.hour.loading")}
      </p>
    );
  }
  const { last } = stats;
  return (
    <>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-2 text-sm text-secondary">{t("landing.hour.axis")}</p>
        <LastHourChart
          minutes={minutes}
          stats={stats}
          timeZone={LIVE_SOURCE.timeZone}
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
        {last.pressureHpa !== null && (
          <Stat
            label={t("landing.hour.pressure")}
            value={`${last.pressureHpa.toFixed(1)} ${t("unit.hPa")}`}
          />
        )}
        {last.temperatureC !== null && (
          <Stat
            label={t("landing.hour.temperature")}
            value={`${last.temperatureC.toFixed(1)} ${t("unit.celsius")}`}
          />
        )}
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

const STEPS = [
  { icon: Zap, title: "landing.how.detector.title", body: "landing.how.detector.body" },
  { icon: Cpu, title: "landing.how.agent.title", body: "landing.how.agent.body" },
  { icon: Globe2, title: "landing.how.open.title", body: "landing.how.open.body" },
] as const;

/** The public landing (PUBLIC-SITE-PLAN §1): the live detector first, then what MuonHub is. */
export function LandingPage(): ReactNode {
  const feed = useLiveFeed();
  const stats = hourStats(feed.minutes);
  const seconds = feed.replayDelayMs === null ? null : Math.round(feed.replayDelayMs / 1000);

  return (
    <>
      <main id="main">
        <section
          className="surface-night relative isolate overflow-hidden"
          aria-labelledby="hero-title"
        >
          <ParticleField
            queue={feed.queue}
            replayDelayMs={feed.replayDelayMs}
            detectorLabel={t("landing.hero.detector")}
          />
          <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col justify-center px-6 pb-16 pt-[340px] min-[900px]:pt-16">
            <div className="max-w-xl">
              <StatusLine status={feed.status} newestEventTs={feed.newestEventTs} />
              <h1
                id="hero-title"
                className="mt-4 text-5xl font-semibold leading-tight tracking-tight sm:text-6xl"
              >
                {t("landing.hero.title")}
              </h1>
              <p className="mt-6 text-lg text-secondary">{t("landing.hero.lead")}</p>
              <div className="mt-8">
                <Readout stats={stats} />
              </div>
              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#last-hour"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 py-2 font-medium text-bg"
                >
                  {t("landing.hero.cta.lastHour")}
                  <ArrowDown size={18} aria-hidden="true" />
                </a>
                <Link
                  href="/network"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-5 py-2 font-medium"
                >
                  {t("landing.hero.cta.network")}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </div>
              <p className="mt-8 max-w-lg text-sm text-muted">
                {seconds === null
                  ? t("landing.hero.noteWaiting")
                  : t("landing.hero.note", { seconds })}
              </p>
            </div>
          </div>
        </section>

        <section
          id="last-hour"
          className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24"
          aria-labelledby="hour-title"
        >
          <h2 id="hour-title" className="text-3xl font-semibold tracking-tight">
            {t("landing.hour.title")}
          </h2>
          <p className="mt-4 max-w-3xl text-secondary">{t("landing.hour.intro")}</p>
          <div className="mt-8">
            <LastHour status={feed.status} stats={stats} minutes={feed.minutes} />
          </div>
        </section>

        <section className="border-y border-border bg-surface" aria-labelledby="how-title">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <h2 id="how-title" className="text-3xl font-semibold tracking-tight">
              {t("landing.how.title")}
            </h2>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-muted">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Icon size={22} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{t(title)}</h3>
                  <p className="mt-2 text-secondary">{t(body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24" aria-labelledby="equator-title">
          <div className="grid gap-12 lg:grid-cols-[3fr_2fr]">
            <div>
              <h2 id="equator-title" className="text-3xl font-semibold tracking-tight">
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
                <div key={label} className="rounded-lg border border-border p-4">
                  <dt className="text-sm text-secondary">{t(label)}</dt>
                  <dd className="mt-1 font-mono text-2xl tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-border" aria-labelledby="network-title">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <h2 id="network-title" className="text-3xl font-semibold tracking-tight">
              {t("landing.network.title")}
            </h2>
            <div className="mt-10 grid gap-8 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface p-6">
                <p className="text-xl font-semibold">{LIVE_SOURCE.station}</p>
                <p className="mt-1 text-secondary">{LIVE_SOURCE.place}</p>
                <p className="mt-4 text-sm text-secondary">{t("landing.network.stationKind")}</p>
                <p className="mt-4 flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2 w-2 rounded-full ${feed.status === "live" ? "bg-accent-warm" : "bg-muted"}`}
                  />
                  {feed.status === "live" ? t("landing.network.live") : t("landing.network.quiet")}
                </p>
              </div>
              <div>
                <p className="text-lg text-secondary">{t("landing.network.body")}</p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Link
                    href="/network"
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-5 py-2 font-medium"
                  >
                    {t("landing.network.cta.map")}
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 py-2 font-medium text-bg"
                  >
                    {t("landing.network.cta.join")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-3 px-6 py-12 text-sm text-secondary">
          <p className="text-base text-text">{t("landing.footer.about")}</p>
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
