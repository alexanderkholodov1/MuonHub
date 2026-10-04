"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { Station } from "@muonhub/shared";
import { Button, Card } from "@muonhub/ui";
import { Plus } from "lucide-react";
import { useAuth } from "../../components/AuthProvider";
import { getDataProvider } from "../../lib/data-provider";
import { missingOptionalStationMetadata } from "../../components/stations/station-utils";

export default function StationsPage(): React.ReactElement {
  const { user } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user == null) return;
    let active = true;
    setLoading(true);
    setError(null);

    void getDataProvider()
      .then((provider) => provider.listStations({ ownerUid: user.uid }))
      .then((ownedStations) => {
        if (!active) return;
        setStations(ownedStations);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Stations could not be loaded.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] pb-6">
        <div>
          <h1 className="m-0 text-[length:var(--text-h1)] font-semibold leading-tight text-[var(--color-text)]">
            Stations
          </h1>
          <p className="mt-3 max-w-[720px] text-base leading-relaxed text-[var(--color-text-secondary)]">
            Register and manage the station profiles/sites you own. Physical detectors are managed
            under each station.
          </p>
        </div>
        <Link href="/stations/new" className="no-underline">
          <Button icon={<Plus size={16} aria-hidden="true" />}>Create station</Button>
        </Link>
      </div>

      <Card
        title="Your station profiles"
        loading={loading}
        {...(error != null ? { error } : {})}
        empty={!loading && error == null && stations.length === 0}
        emptyMessage="No stations yet. Create your first station profile to register a detector."
      >
        <div className="grid gap-4">
          {stations.map((station) => (
            <StationListItem key={station.id} station={station} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function StationListItem({ station }: { station: Station }): React.ReactElement {
  const missingOptional = missingOptionalStationMetadata(station);

  return (
    <Link
      href={`/stations/${station.id}`}
      className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 no-underline transition-colors hover:border-[var(--color-accent)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-[length:var(--text-h4)] font-semibold text-[var(--color-text)]">
            {station.name}
          </h2>
          <p className="mt-2 text-base text-[var(--color-text-secondary)]">
            {station.city}, {station.country} · {station.altitudeM.toLocaleString("en-US")} m
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{station.visibility}</Badge>
          <Badge>{station.type}</Badge>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm text-[var(--color-text-secondary)] md:grid-cols-3">
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
            Location
          </dt>
          <dd className="mt-1 font-mono text-[var(--color-text)]">
            {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
            Placement
          </dt>
          <dd className="mt-1 text-[var(--color-text)]">{station.placement}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
            Metadata
          </dt>
          <dd className="mt-1 text-[var(--color-text)]">
            {missingOptional.length === 0 ? "Complete optional set" : `${missingOptional.length} optional fields missing`}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

function Badge({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono text-xs uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
      {children}
    </span>
  );
}
