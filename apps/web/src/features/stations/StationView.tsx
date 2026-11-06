"use client";

import React from "react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { v2 } from "@muonhub/shared";
import { v2 as dp } from "@muonhub/data-provider";
import { Button } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { useResource } from "@/lib/data/useResource";
import { t } from "@/i18n/t";
import { useAuth } from "@/features/auth/AuthProvider";
import { StationForm } from "./StationForm";
import { MembersSection, TransferSection } from "./MembersSection";
import {
  canEditStationMetadata,
  canManageDevicesAndStreams,
  resolveStationRole,
  type StationAccessRole,
} from "./resolve-role";

interface StationBundle {
  station: v2.Station;
  role: StationAccessRole;
  devices: v2.Device[];
  streams: v2.Stream[];
  deviceInvalid: number;
  streamInvalid: number;
}

function isMember(role: StationAccessRole): boolean {
  return role === "owner" || role === "editor" || role === "viewer";
}

function formatLocation(station: v2.Station, role: StationAccessRole): ReactNode {
  const cityCountry = `${station.location.city}, ${station.location.countryCode}`;
  if (isMember(role)) {
    return (
      <dl className="grid gap-2 text-base">
        <div>
          <dt className="text-secondary">{t("station.field.city")}</dt>
          <dd>{cityCountry}</dd>
        </div>
        <div>
          <dt className="text-secondary">{t("station.field.lat")}</dt>
          <dd className="font-mono tabular-nums">{station.location.lat}</dd>
        </div>
        <div>
          <dt className="text-secondary">{t("station.field.lon")}</dt>
          <dd className="font-mono tabular-nums">{station.location.lon}</dd>
        </div>
        <div>
          <dt className="text-secondary">{t("station.field.altitude")}</dt>
          <dd className="font-mono tabular-nums">{station.location.altitudeM}</dd>
        </div>
      </dl>
    );
  }
  return <p>{cityCountry}</p>;
}

export function StationView({ stationId }: { stationId: string | null }): ReactNode {
  const provider = useDataProvider();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const key =
    provider !== null && user !== null && stationId !== null && stationId !== ""
      ? `${stationId}:${user.uid}`
      : null;
  const resource = useResource<StationBundle>(key, async () => {
    if (provider === null || user === null || stationId === null || stationId === "") {
      throw new dp.DataProviderError("unauthenticated");
    }
    const station = await provider.getStation(stationId);
    if (station === null) throw new dp.DataProviderError("not-found");
    const role = await resolveStationRole(provider, station, user.uid);
    const devices = await provider.listDevices(stationId);
    const streams = await provider.listStreams(stationId);
    return {
      station,
      role,
      devices: devices.items,
      streams: streams.items,
      deviceInvalid: devices.quarantine.count,
      streamInvalid: streams.quarantine.count,
    };
  });

  if (stationId === null || stationId === "") {
    return <p role="alert">{t("station.missingId")}</p>;
  }

  if (resource.status === "loading") return <p role="status">{t("state.loading")}</p>;
  if (resource.status === "error") {
    const missing = resource.error === t("error.notFound");
    return (
      <div className="space-y-4">
        <p role="alert">{resource.error}</p>
        {!missing && (
          <Button size="lg" variant="secondary" onClick={resource.reload}>
            {t("state.retry")}
          </Button>
        )}
        <Link className="underline" href="/app">
          {t("station.backHome")}
        </Link>
      </div>
    );
  }

  const { station, role, devices, streams, deviceInvalid, streamInvalid } = resource.data;
  const canEditMeta = canEditStationMetadata(role);
  const canManageInventory = canManageDevicesAndStreams(role);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold">{station.name}</h1>
          <p className="text-secondary">
            {role === "non-member"
              ? t("station.roleGuest")
              : t("station.yourRole", { role: t(`stations.role.${role}`) })}
          </p>
        </div>
        <Link className="underline" href="/app">
          {t("station.backHome")}
        </Link>
      </div>

      {canEditMeta && !editing && (
        <Button size="lg" variant="secondary" type="button" onClick={() => setEditing(true)}>
          {t("station.edit")}
        </Button>
      )}

      {canEditMeta && editing ? (
        <section className="rounded-md border border-border bg-surface p-6">
          <h2 className="mb-6 text-2xl font-semibold">{t("station.edit")}</h2>
          <StationForm
            mode="edit"
            stationId={station.id}
            initial={station}
            onSaved={() => {
              setEditing(false);
              resource.reload();
            }}
          />
          <Button
            className="mt-4"
            size="lg"
            variant="secondary"
            type="button"
            onClick={() => setEditing(false)}
          >
            {t("station.cancel")}
          </Button>
        </section>
      ) : (
        <section className="space-y-4 rounded-md border border-border bg-surface p-6">
          <h2 className="text-2xl font-semibold">{t("station.details")}</h2>
          <dl className="grid gap-4 md:grid-cols-2">
            <div>
              <dt className="text-secondary">{t("station.field.visibility")}</dt>
              <dd>{t(`station.visibility.${station.visibility}`)}</dd>
            </div>
            <div>
              <dt className="text-secondary">{t("station.field.publicPrecision")}</dt>
              <dd>{t(`station.precision.${station.publicPrecision}`)}</dd>
            </div>
            <div>
              <dt className="text-secondary">{t("station.field.timezone")}</dt>
              <dd>{station.timezone}</dd>
            </div>
          </dl>
          <div>
            <h3 className="mb-2 text-xl font-semibold">{t("station.locationTitle")}</h3>
            {formatLocation(station, role)}
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-md border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">{t("devices.title")}</h2>
          {canManageInventory && (
            <Link
              className="underline"
              href={`/app/device/new?station=${encodeURIComponent(station.id)}`}
            >
              {t("devices.add")}
            </Link>
          )}
        </div>
        {deviceInvalid > 0 && <p role="alert">{t("devices.invalid", { count: deviceInvalid })}</p>}
        {devices.length === 0 ? (
          <p className="text-secondary">{t("devices.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((device) => (
              <li key={device.id}>
                <span>{device.label}</span>{" "}
                <span className="text-secondary">
                  {t("devices.statusLine", { status: t(`devices.status.${device.status}`) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-md border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">{t("streams.title")}</h2>
          {canManageInventory && (
            <Link
              className="underline"
              href={`/app/stream/new?station=${encodeURIComponent(station.id)}`}
            >
              {t("streams.add")}
            </Link>
          )}
        </div>
        {streamInvalid > 0 && <p role="alert">{t("streams.invalid", { count: streamInvalid })}</p>}
        {streams.length === 0 ? (
          <p className="text-secondary">{t("streams.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {streams.map((stream) => (
              <li key={stream.id}>
                <Link
                  className="underline"
                  href={`/app/stream?id=${encodeURIComponent(stream.id)}`}
                >
                  {devices.find((d) => d.id === stream.deviceId)?.label ?? stream.id}
                </Link>{" "}
                <span className="text-secondary">
                  {t("streams.statusLine", { status: t(`streams.status.${stream.status}`) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEditMeta && (
        <>
          <MembersSection stationId={station.id} role={role} />
          <TransferSection stationId={station.id} role={role} />
        </>
      )}
      {(role === "editor" || role === "viewer") && (
        <MembersSection stationId={station.id} role={role} />
      )}
    </div>
  );
}
