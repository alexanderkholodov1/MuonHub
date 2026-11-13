"use client";

import Link from "next/link";
import React, { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { t } from "@/i18n/t";
import { useDetectorStatus } from "@/features/landing/useLiveFeed";
import { BRIDGE_STATION, bridgeFeature } from "./bridge";
import { placeText, toFeatures } from "./geojson";
import { NetworkMap } from "./NetworkMap";
import { usePublicStations } from "./usePublicStations";

function Dot({ on }: { on: boolean }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${on ? "bg-accent-warm" : "bg-muted"}`}
    />
  );
}

export function NetworkPage(): ReactNode {
  const stations = usePublicStations();
  const bridgeStatus = useDetectorStatus();
  const bridgeLive = bridgeStatus === "live";
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
  const sending = (showBridge && bridgeLive ? 1 : 0) + v6.filter((s) => s.active).length;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{t("network.title")}</h1>
          <p className="mt-4 text-lg text-secondary">{t("network.intro")}</p>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-secondary">{t("network.stats.stations")}</dt>
            <dd className="mt-1 font-mono text-3xl tabular-nums">{total}</dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-secondary">{t("network.stats.sending")}</dt>
            <dd className="mt-1 font-mono text-3xl tabular-nums">{sending}</dd>
          </div>
        </dl>

        <section aria-labelledby="stations-title">
          <h2 id="stations-title" className="text-xl font-semibold">
            {t("network.listTitle")}
          </h2>
          <ul className="mt-4 space-y-4">
            {showBridge && (
              <li className="rounded-lg border border-border bg-surface p-5">
                <p className="text-lg font-semibold">{BRIDGE_STATION.name}</p>
                <p className="text-secondary">{BRIDGE_STATION.place}</p>
                <p className="mt-3 text-sm text-secondary">{t("landing.network.stationKind")}</p>
                <p className="mt-3 flex items-center gap-2 text-sm">
                  <Dot on={bridgeLive} />
                  {bridgeLive ? t("landing.network.live") : t("landing.network.quiet")}
                </p>
                <Link
                  href="/#last-hour"
                  className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-accent underline-offset-4 hover:underline"
                >
                  {t("network.watchLive")}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <p className="mt-2 text-sm text-muted">{t("network.bridgeNote")}</p>
              </li>
            )}
            {v6.map((s) => (
              <li key={s.id} className="rounded-lg border border-border bg-surface p-5">
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
        </section>

        <div className="rounded-lg border border-border p-5">
          <p className="text-secondary">{t("network.join")}</p>
          <Link
            href="/signup"
            className="mt-4 inline-flex min-h-11 items-center rounded-md bg-accent px-5 py-2 font-medium text-bg"
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
  );
}
