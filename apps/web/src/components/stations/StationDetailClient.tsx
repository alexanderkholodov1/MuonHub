"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Detector, Station } from "@muonhub/shared";
import { Button, Card } from "@muonhub/ui";
import { ArrowLeft, Edit3, Plus } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { getDataProvider } from "../../lib/data-provider";
import { StationDashboard } from "./StationDashboard";
import { DetectorRegistrationForm, StationForm } from "./StationForms";
import {
  missingOptionalStationMetadata,
  stationHasMixedDeviceTokens,
} from "./station-utils";

export function StationDetailClient(): React.ReactElement {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const stationId = params.id;
  const [station, setStation] = useState<Station | null>(null);
  const [detectors, setDetectors] = useState<Detector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingDetector, setAddingDetector] = useState(false);

  const loadStation = useCallback(() => {
    if (user == null) return;
    let active = true;
    setLoading(true);
    setError(null);

    void getDataProvider()
      .then(async (provider) => {
        const loadedStation = await provider.getStation(stationId);
        if (loadedStation == null) {
          throw new Error("Station was not found.");
        }
        if (loadedStation.ownerUid !== user.uid) {
          throw new Error("This station is not owned by the signed-in user.");
        }
        const loadedDetectors = await provider.listDetectors(stationId);
        return { loadedStation, loadedDetectors };
      })
      .then(({ loadedStation, loadedDetectors }) => {
        if (!active) return;
        setStation(loadedStation);
        setDetectors(loadedDetectors);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Station detail could not be loaded.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [stationId, user]);

  useEffect(() => {
    return loadStation();
  }, [loadStation]);

  if (user == null) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <Card title="Loading account" loading />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <Card title="Loading station" loading />
      </div>
    );
  }

  if (error != null || station == null) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <Link href="/stations" className="mb-4 inline-flex no-underline">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} aria-hidden="true" />}>
            Back to stations
          </Button>
        </Link>
        <Card title="Station unavailable" error={error ?? "Station detail could not be loaded."} />
      </div>
    );
  }

  const missingOptional = missingOptionalStationMetadata(station);
  const mixedDeviceTokens = stationHasMixedDeviceTokens(detectors);

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="mb-8 border-b border-[var(--color-border)] pb-6">
        <Link href="/stations" className="mb-4 inline-flex no-underline">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} aria-hidden="true" />}>
            Back to stations
          </Button>
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="m-0 text-[length:var(--text-h1)] font-semibold leading-tight text-[var(--color-text)]">
              {station.name}
            </h1>
            <p className="mt-3 max-w-[760px] text-base leading-relaxed text-[var(--color-text-secondary)]">
              {station.city}, {station.country} · {station.altitudeM.toLocaleString("en-US")} m ·{" "}
              {station.placement}
            </p>
          </div>
          <Button
            variant="secondary"
            icon={<Edit3 size={16} aria-hidden="true" />}
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? "Close editor" : "Edit metadata"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {missingOptional.length > 0 && (
          <NonBlockingStationNotice
            title="Metadata completion reminder"
            body={`Optional metadata still missing: ${missingOptional.join(", ")}. Complete it when available to improve future context and migrated-station quality.`}
          />
        )}

        {mixedDeviceTokens && (
          <NonBlockingStationNotice
            title="Device-token consistency advisory"
            body="This station has detectors with different device tokens. If these represent different physical sites, split them into separate stations; if this is an intentional multi-detector setup, no action is required."
          />
        )}

        {editing && (
          <StationForm
            mode="edit"
            ownerUid={user.uid}
            initialStation={station}
            onSaved={(updatedStation) => {
              setStation(updatedStation);
              setEditing(false);
            }}
          />
        )}

        <StationDashboard station={station} detectors={detectors} />

        <Card title="Station metadata">
          <dl className="grid gap-4 text-sm md:grid-cols-3">
            <MetadataItem label="Visibility" value={station.visibility} />
            <MetadataItem label="Station type" value={station.type} />
            <MetadataItem label="Timezone" value={station.timezone} />
            <MetadataItem label="Latitude" value={station.latitude.toFixed(6)} mono />
            <MetadataItem label="Longitude" value={station.longitude.toFixed(6)} mono />
            <MetadataItem label="Altitude" value={`${station.altitudeM.toLocaleString("en-US")} m`} mono />
            <MetadataItem label="Floor" value={station.floor ?? "Not provided"} />
            <MetadataItem label="Shielding" value={station.shielding ?? "Not provided"} />
            <MetadataItem label="Orientation" value={station.orientation ?? "Not provided"} />
          </dl>
          {station.notes != null && station.notes.trim() !== "" && (
            <p className="mt-6 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
              {station.notes}
            </p>
          )}
        </Card>

        <Card
          title="Detectors"
          empty={detectors.length === 0}
          emptyMessage="No detectors registered for this station yet."
        >
          <div className="grid gap-4">
            {detectors.map((detector) => (
              <DetectorCard key={detector.id} detector={detector} />
            ))}
          </div>
        </Card>

        <div>
          <Button
            variant={addingDetector ? "ghost" : "secondary"}
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => setAddingDetector((current) => !current)}
          >
            {addingDetector ? "Close detector form" : "Register another detector"}
          </Button>
        </div>

        {addingDetector && (
          <DetectorRegistrationForm
            stationId={station.id}
            existingDetectors={detectors}
            onSaved={(detector) => {
              setDetectors((current) => [...current, detector]);
              setAddingDetector(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function MetadataItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd
        className={`mt-1 text-base text-[var(--color-text)] ${
          mono ? "font-mono tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function DetectorCard({ detector }: { detector: Detector }): React.ReactElement {
  const calibration = detector.calibration;
  const adcToMv = calibration?.adcToMv;

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-[length:var(--text-h4)] font-semibold text-[var(--color-text)]">
            {detector.label ?? detector.hardwareModel}
          </h2>
          <p className="mt-2 text-base text-[var(--color-text-secondary)]">
            {detector.hardwareModel} · firmware {detector.firmwareVersion}
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono text-xs uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
          {detector.status}
        </span>
      </div>

      <dl className="mt-4 grid gap-4 text-sm md:grid-cols-4">
        <MetadataItem label="Detector id" value={detector.id} mono />
        <MetadataItem label="Device token" value={detector.deviceToken} mono />
        <MetadataItem label="Hardware version" value={detector.hwVersion} />
        <MetadataItem label="SiPM count" value={String(detector.sipmCount)} mono />
        <MetadataItem
          label="ADC to mV"
          value={adcToMv == null ? "Not set" : `${adcToMv[0]}x + ${adcToMv[1]}`}
          mono
        />
        <MetadataItem
          label="Saturation"
          value={calibration?.saturationMv == null ? "Not set" : `${calibration.saturationMv} mV`}
          mono
        />
        <MetadataItem
          label="Trigger min"
          value={
            calibration?.triggerAdcMin == null ? "Not set" : String(calibration.triggerAdcMin)
          }
          mono
        />
      </dl>
    </article>
  );
}

function NonBlockingStationNotice({
  title,
  body,
}: {
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <div className="rounded-md border border-[var(--color-warning)] bg-[var(--color-surface-2)] p-4">
      <p className="text-base font-medium text-[var(--color-text)]">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{body}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">This advisory does not block station use.</p>
    </div>
  );
}
