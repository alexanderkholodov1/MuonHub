"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Stat } from "@muonhub/ui";
import { MapPinned, RadioTower } from "lucide-react";
import type { CityDetectorAggregate } from "./city-aggregation";

const CityDetectorMapCanvas = dynamic(
  async () => {
    const importedMap = await import("./CityDetectorMapCanvas");
    return importedMap.CityDetectorMapCanvas;
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-sm text-[var(--color-text-secondary)]">
        Preparing network map...
      </div>
    ),
  },
);

export function CityDetectorMap({
  cities,
  loading,
  error,
  emptyMessage,
}: {
  readonly cities: ReadonlyArray<CityDetectorAggregate>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly emptyMessage: string;
}): React.ReactElement {
  const [selectedCityKey, setSelectedCityKey] = useState<string | null>(cities[0]?.key ?? null);
  const selectedCity = useMemo(() => {
    return cities.find((city) => city.key === selectedCityKey) ?? cities[0] ?? null;
  }, [cities, selectedCityKey]);
  const totals = useMemo(() => {
    return cities.reduce(
      (current, city) => ({
        detectorCount: current.detectorCount + city.detectorCount,
        activeNowCount: current.activeNowCount + city.activeNowCount,
      }),
      { detectorCount: 0, activeNowCount: 0 },
    );
  }, [cities]);

  if (loading) {
    return <Card title="Public detector network" loading />;
  }

  if (error != null) {
    return <Card title="Public detector network" error={error} />;
  }

  if (cities.length === 0) {
    return (
      <Card
        title="Public detector network"
        empty
        emptyMessage={emptyMessage}
        className="min-h-[420px]"
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.5fr)]">
      <Card
        title={
          <span className="flex items-center gap-2">
            <MapPinned size={22} aria-hidden="true" />
            City-aggregated detector map
          </span>
        }
      >
        <CityDetectorMapCanvas
          cities={cities}
          selectedCityKey={selectedCity?.key ?? null}
          onSelectCity={setSelectedCityKey}
        />
        <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          Each bubble is one city centroid. Bubble size and number reflect public detector count;
          the active-now readout is city-level only.
        </p>
      </Card>

      <aside className="grid content-start gap-4" aria-label="City detector summary">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Stat label="Public detectors" value={totals.detectorCount} unit="total" />
          <Stat
            label="Active now"
            value={totals.activeNowCount}
            unit="recent"
            trend={totals.activeNowCount > 0 ? "up" : "neutral"}
          />
        </div>

        {selectedCity != null && (
          <Card
            title={
              <span className="flex items-center gap-2">
                <RadioTower size={20} aria-hidden="true" />
                {selectedCity.city}, {selectedCity.country}
              </span>
            }
          >
            <dl className="grid gap-4">
              <CityMetric label="Detector count" value={selectedCity.detectorCount} />
              <CityMetric label="Active now" value={selectedCity.activeNowCount} />
              <CityMetric
                label="Map position"
                value={
                  selectedCity.positionSource === "city-centroid"
                    ? "City centroid"
                    : "Coarse fallback"
                }
              />
            </dl>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
              Public landing details stop at city and country. Station names, exact coordinates,
              addresses, and owner identity are not shown here.
            </p>
          </Card>
        )}

        <Card title="Cities on the network">
          <div className="grid gap-2">
            {cities.map((city) => (
              <button
                key={city.key}
                type="button"
                className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-left text-sm text-[var(--color-text-secondary)] transition hover:border-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                onClick={() => setSelectedCityKey(city.key)}
                aria-pressed={city.key === selectedCity?.key}
              >
                <span className="font-medium text-[var(--color-text)]">
                  {city.city}, {city.country}
                </span>
                <span className="font-mono tabular-nums">
                  {city.activeNowCount}/{city.detectorCount} active
                </span>
              </button>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  );
}

function CityMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
