"use client";

import React, { useEffect, useState } from "react";
import type { Detector, MinuteRecord, Station } from "@muonhub/shared";
import { RadioTower, SatelliteDish } from "lucide-react";
import { CityDetectorMap } from "./CityDetectorMap";
import {
  aggregatePublicStationsByCity,
  stationToPublicCitySummary,
  type CityDetectorAggregate,
  type StationDetectorActivity,
} from "./city-aggregation";
import { PublicLiveDemo, type PublicDemoDetector } from "./PublicLiveDemo";
import { getDataProvider, isDataProviderConfigurationError } from "../../lib/data-provider";

const ACTIVE_NOW_WINDOW_MS = 10 * 60 * 1000;

type LandingNetworkState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly cities: ReadonlyArray<CityDetectorAggregate>;
      readonly demoDetector: PublicDemoDetector | null;
      readonly emptyMapMessage: string;
    };

interface PublicStationContext {
  readonly id: string;
  readonly type: Station["type"];
  readonly city: string;
  readonly country: string;
}

interface StationDetectorResult {
  readonly stationId: string;
  readonly detectors: ReadonlyArray<Detector>;
  readonly latestRecords: ReadonlyArray<MinuteRecord | null>;
}

export function PublicLandingNetwork(): React.ReactElement {
  const [state, setState] = useState<LandingNetworkState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function loadNetwork(): Promise<void> {
      const provider = await getDataProvider();
      const publicStations = await provider.listStations({ visibility: "public" });

      const stationSummaries = publicStations.map(stationToPublicCitySummary);
      const stationContexts: PublicStationContext[] = publicStations.map((station) => ({
        id: station.id,
        type: station.type,
        city: station.city,
        country: station.country,
      }));

      const detectorResults = await Promise.all(
        stationContexts.map(async (station): Promise<StationDetectorResult> => {
          const detectors = await provider.listDetectors(station.id);
          const latestRecords = await Promise.all(
            detectors.map((detector) => provider.getLatest(detector.id).catch(() => null)),
          );
          return { stationId: station.id, detectors, latestRecords };
        }),
      );

      const now = Date.now();
      const detectorActivity: StationDetectorActivity[] = detectorResults.map((result) => ({
        stationId: result.stationId,
        detectorCount: result.detectors.length,
        activeNowCount: result.detectors.filter((detector, index) =>
          isDetectorActiveNow(detector, result.latestRecords[index] ?? null, now),
        ).length,
      }));

      const cities = aggregatePublicStationsByCity(stationSummaries, detectorActivity);
      const demoDetector = selectPublicDemoDetector(stationContexts, detectorResults);
      const emptyMapMessage =
        publicStations.length === 0
          ? "No public stations yet. Public stations will appear here as city-level bubbles once they join the network."
          : "No public detectors are registered in public stations yet.";

      if (!active) return;
      setState({ status: "ready", cities, demoDetector, emptyMapMessage });
    }

    setState({ status: "loading" });
    void loadNetwork().catch((error: unknown) => {
      if (!active) return;
      setState({
        status: "error",
        message: errorMessage(error, "The public detector network could not be loaded."),
      });
    });

    return () => {
      active = false;
    };
  }, []);

  const cities = state.status === "ready" ? state.cities : [];
  const demoDetector = state.status === "ready" ? state.demoDetector : null;
  const error = state.status === "error" ? state.message : null;
  const loading = state.status === "loading";
  const emptyMapMessage =
    state.status === "ready"
      ? state.emptyMapMessage
      : "No public stations yet. Public stations will appear here as city-level bubbles once they join the network.";

  return (
    <>
      <section
        id="network"
        className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-16"
        aria-labelledby="network-title"
      >
        <div className="mx-auto grid max-w-[1280px] gap-8">
          <SectionHeader
            eyebrow="Public network"
            title="Detector coverage, aggregated by city"
            icon={<RadioTower size={22} aria-hidden="true" />}
          >
            The landing map shows reach without exposing sites: one bubble per city, placed on a
            city centroid or a coarse fallback, with only detector counts and active-now counts
            shown.
          </SectionHeader>
          <CityDetectorMap
            cities={cities}
            loading={loading}
            error={error}
            emptyMessage={emptyMapMessage}
          />
        </div>
      </section>

      <section
        id="live-demo"
        className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16"
        aria-labelledby="live-demo-section-title"
      >
        <div className="mx-auto grid max-w-[1280px] gap-8">
          <SectionHeader
            eyebrow="Live demo"
            title="Recent corrected charged-particle rate"
            icon={<SatelliteDish size={22} aria-hidden="true" />}
            titleId="live-demo-section-title"
          >
            A public detector demo reuses the same corrected-rate chart as station dashboards. The
            wording remains honest for single-SiPM hardware: charged-particle / MIP-type rate, not
            per-event particle identification.
          </SectionHeader>
          {error != null ? (
            <PublicLiveDemo detector={null} />
          ) : loading ? (
            <PublicLiveDemo detector={null} />
          ) : (
            <PublicLiveDemo detector={demoDetector} />
          )}
        </div>
      </section>
    </>
  );
}

function selectPublicDemoDetector(
  stations: ReadonlyArray<PublicStationContext>,
  detectorResults: ReadonlyArray<StationDetectorResult>,
): PublicDemoDetector | null {
  for (const result of detectorResults) {
    const station = stations.find((candidate) => candidate.id === result.stationId);
    if (station == null) continue;

    const detectorWithData =
      result.detectors.find((_, index) => result.latestRecords[index] != null) ??
      result.detectors[0];
    if (detectorWithData == null) continue;

    return {
      detectorId: detectorWithData.id,
      hwVersion: detectorWithData.hwVersion,
      stationType: station.type,
      city: station.city.trim(),
      country: station.country.trim().toUpperCase(),
    };
  }

  return null;
}

function isDetectorActiveNow(
  detector: Detector,
  latestRecord: MinuteRecord | null,
  now: number,
): boolean {
  if (detector.status === "active") return true;
  return latestRecord != null && now - latestRecord.ts <= ACTIVE_NOW_WINDOW_MS;
}

function SectionHeader({
  eyebrow,
  title,
  titleId,
  icon,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly titleId?: string;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const headingId = titleId ?? "network-title";
  return (
    <div>
      <p className="mb-3 mt-0 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-[var(--color-accent)]">
        {icon}
        {eyebrow}
      </p>
      <h2
        id={headingId}
        className="mb-4 mt-0 text-[length:var(--text-h2)] font-semibold leading-tight text-[var(--color-text)]"
      >
        {title}
      </h2>
      <p className="m-0 max-w-[780px] text-base leading-relaxed text-[var(--color-text-secondary)]">
        {children}
      </p>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (isDataProviderConfigurationError(error)) {
    return error.state.message;
  }
  return error instanceof Error ? error.message : fallback;
}
