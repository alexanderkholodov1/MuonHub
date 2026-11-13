"use client";

import Link from "next/link";
import React, { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { t } from "@/i18n/t";
import { DetectorsShowcase } from "@/features/landing/DetectorsShowcase";
import { Globe } from "@/features/landing/Globe";
import { LIVE_SOURCE } from "@/features/landing/live-feed";
import { useLiveFeed } from "@/features/landing/useLiveFeed";
import { useV5Detectors } from "@/features/landing/useV5Detectors";
import { BRIDGE_STATION, bridgeFeature } from "./bridge";
import { placeText, toFeatures } from "./geojson";
import { NetworkMap } from "./NetworkMap";
import { usePublicStations } from "./usePublicStations";

function Dot({ on }: { on: boolean }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${on ? "bg-brand" : "bg-muted"}`}
    />
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone: string }): ReactNode {
  return (
    <div className="rounded-lg border border-border bg-surface/80 p-4 backdrop-blur-sm">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className={`mt-1 font-mono text-3xl tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

/**
 * The network page, in the landing's style: the planet with every munhub-lab detector, their cards
 * and timeline, then the stations registered in MuonHub with the map (spec 0091) — header and footer
 * shared with the rest of the site.
 */
export function NetworkPage(): ReactNode {
  const feed = useLiveFeed();
  const detectors = useV5Detectors();
  const stations = usePublicStations();
  const list = detectors.status === "ready" ? detectors.data : [];
  const liveDetectors = list.filter((d) => d.live).length;
  const bridgeLive = feed.status === "live";
  const v6 = useMemo(() => (stations.status === "ready" ? stations.data : []), [stations]);
  // Once v6 publishes the station itself, the bridge's copy steps aside.
  const showBridge = !v6.some((s) => s.name === BRIDGE_STATION.name);
  const features = useMemo(() => {
    const collection = toFeatures(v6);
    return showBridge
      ? { ...collection, features: [bridgeFeature(bridgeLive), ...collection.features] }
      : collection;
  }, [v6, bridgeLive, showBridge]);
  const total = v6.length + (showBridge ? 1 : 0);

  return (
    <>
      <div className="surface-night relative isolate overflow-hidden">
        <SiteHeader overlay />
        <main id="main">
          <section
            className="mx-auto grid max-w-6xl items-center gap-8 px-6 pb-12 lg:min-h-[calc(100svh-4.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
            aria-labelledby="network-title"
          >
            <div className="order-2 lg:order-1">
              <p className="font-mono text-sm uppercase tracking-widest text-cosmic">
                {t("network.title")}
              </p>
              <h1
                id="network-title"
                className="mt-2 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl"
              >
                {t("network.hero.title")}
              </h1>
              <p className="mt-4 max-w-xl text-lg text-secondary">{t("network.hero.lead")}</p>
              <dl className="mt-8 grid max-w-xl grid-cols-3 gap-3">
                <Figure
                  label={t("nav.detectors")}
                  value={list.length}
                  tone="text-accent"
                />
                <Figure
                  label={t("network.stats.sending")}
                  value={liveDetectors}
                  tone="text-brand"
                />
                <Figure label={t("network.stats.stations")} value={total} tone="text-cosmic" />
              </dl>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/#live-data"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 py-2 font-medium text-on-brand"
                >
                  {t("landing.hero.cta.lastHour")}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-brand px-5 py-2 font-medium text-brand"
                >
                  {t("nav.home")}
                </Link>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="mx-auto aspect-square h-[44svh] max-h-[620px] max-w-full lg:h-[min(80svh,620px)]">
                <Globe
                  queue={feed.queue}
                  replayDelayMs={feed.replayDelayMs}
                  detectors={Math.max(list.length, 1)}
                  liveDetectors={bridgeLive ? 1 : 0}
                  label={t("landing.globe.label")}
                  sublabel={
                    list.length > 0
                      ? t("landing.globe.sublabel", { count: list.length, live: liveDetectors })
                      : LIVE_SOURCE.station
                  }
                />
              </div>
            </div>
          </section>
        </main>
      </div>

      <section className="surface-cosmic" aria-labelledby="network-detectors">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="font-mono text-sm uppercase tracking-widest text-cosmic">
            {t("landing.detectors.eyebrow")}
          </p>
          <h2
            id="network-detectors"
            className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {t("landing.detectors.title")}
          </h2>
          <p className="mt-4 max-w-3xl text-secondary">{t("landing.detectors.intro")}</p>
          <DetectorsShowcase detectors={detectors} />
          <p className="mt-6 max-w-3xl text-sm text-muted">{t("landing.detectors.where")}</p>
        </div>
      </section>

      <section className="surface-paper" aria-labelledby="stations-title">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 id="stations-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("network.stations.title")}
          </h2>
          <p className="mt-4 max-w-3xl text-secondary">{t("network.stations.intro")}</p>
          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <h3 className="text-xl font-semibold">{t("network.listTitle")}</h3>
              <ul className="mt-4 space-y-4">
                {showBridge && (
                  <li className="rounded-xl border border-border bg-surface p-5 shadow-sm">
                    <p className="text-lg font-semibold">{BRIDGE_STATION.name}</p>
                    <p className="text-secondary">{BRIDGE_STATION.place}</p>
                    <p className="mt-3 text-sm text-secondary">
                      {t("landing.network.stationKind")}
                    </p>
                    <p className="mt-3 flex items-center gap-2 text-sm">
                      <Dot on={bridgeLive} />
                      {bridgeLive ? t("landing.network.live") : t("landing.network.quiet")}
                    </p>
                    <Link
                      href="/#live-data"
                      className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-accent underline-offset-4 hover:underline"
                    >
                      {t("network.watchLive")}
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                    <p className="mt-2 text-sm text-muted">{t("network.bridgeNote")}</p>
                  </li>
                )}
                {v6.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl border border-border bg-surface p-5 shadow-sm"
                  >
                    <p className="text-lg font-semibold">{s.name}</p>
                    <p className="text-secondary">{placeText(s) ?? t("network.hidden")}</p>
                    <p className="mt-3 text-sm text-secondary">
                      {t("network.devices", { count: s.deviceCount })}
                    </p>
                    <p className="mt-3 flex items-center gap-2 text-sm">
                      <Dot on={s.active} />
                      {s.active ? t("network.active") : t("network.idle")}
                    </p>
                    {s.point === undefined && (
                      <p className="mt-2 text-sm text-muted">{t("network.notOnMap")}</p>
                    )}
                  </li>
                ))}
              </ul>
              {stations.status === "loading" && (
                <p className="mt-4 text-secondary" role="status">
                  {t("state.loading")}
                </p>
              )}
              {stations.status === "error" && (
                <div className="mt-4" role="alert">
                  <p>{stations.error}</p>
                  <button className="mt-2 min-h-11 underline" onClick={stations.reload}>
                    {t("state.retry")}
                  </button>
                </div>
              )}
              <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
                <p className="text-secondary">{t("network.join")}</p>
                <Link
                  href="/signup"
                  className="mt-4 inline-flex min-h-11 items-center rounded-md bg-brand-fill px-5 py-2 font-medium text-on-brand"
                >
                  {t("landing.network.cta.join")}
                </Link>
              </div>
            </div>
            <div className="lg:sticky lg:top-8 lg:self-start">
              {stations.status !== "loading" && <NetworkMap stations={features} />}
              <p className="mt-3 text-sm text-muted">{t("network.mapNote")}</p>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
