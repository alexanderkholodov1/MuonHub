"use client";

import React from "react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v2 } from "@muonhub/shared";
import { v2 as dp } from "@muonhub/data-provider";
import { Button } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { useResource } from "@/lib/data/useResource";
import { errorMessage } from "@/lib/errors";
import { t } from "@/i18n/t";
import { useAuth } from "@/features/auth/AuthProvider";
import { Field, SelectField } from "@/features/stations/form-fields";
import { canManageDevicesAndStreams, resolveStationRole } from "@/features/stations/resolve-role";

/**
 * The built-in device types ship with MuonHub (`v2.BUILTIN_DEVICE_TYPES`) and are always offered;
 * types published to the catalogue are added, and a published copy of a built-in id and version
 * replaces it.
 */
export function withBuiltInTypes(published: readonly v2.DeviceType[]): v2.DeviceType[] {
  const byKey = new Map<string, v2.DeviceType>();
  for (const type of [...v2.BUILTIN_DEVICE_TYPES, ...published]) {
    byKey.set(`${type.id}:${String(type.version)}`, type);
  }
  return [...byKey.values()];
}

export function NewDeviceForm(): ReactNode {
  const provider = useDataProvider();
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const stationId = params.get("station");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessKey =
    provider !== null && user !== null && stationId !== null
      ? `${stationId}:${user.uid}:device`
      : null;
  const access = useResource(accessKey, async () => {
    if (provider === null || user === null || stationId === null) {
      throw new dp.DataProviderError("invalid-argument");
    }
    const station = await provider.getStation(stationId);
    if (station === null) throw new dp.DataProviderError("not-found");
    const role = await resolveStationRole(provider, station, user.uid);
    if (!canManageDevicesAndStreams(role)) throw new dp.DataProviderError("permission-denied");
    const published = await provider.listDeviceTypes();
    return { station, types: withBuiltInTypes(published.items) };
  });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (provider === null || user === null || stationId === null || busy) return;
    if (access.status !== "ready") return;
    const data = new FormData(event.currentTarget);
    const typeKey = String(data.get("deviceType"));
    const [typeId, typeVersion] = typeKey.split(":");
    const geometry: v2.Geometry = {
      activeAreaCm2: Number(data.get("activeAreaCm2")),
      thicknessCm: Number(data.get("thicknessCm")),
      material: String(data.get("material")).trim(),
      orientation: String(data.get("orientation")) as v2.Geometry["orientation"],
    };
    const tilt = data.get("tiltDeg");
    if (geometry.orientation === "tilted" && tilt !== null && String(tilt) !== "") {
      geometry.tiltDeg = Number(tilt);
    }
    const device = v2.DeviceSchema.safeParse({
      schemaVersion: 2,
      id: dp.newStationId(),
      ownerUid: user.uid,
      stationId,
      deviceType: { id: typeId, version: Number(typeVersion) },
      label: String(data.get("label")).trim(),
      geometry,
      status: String(data.get("status")) as v2.Device["status"],
      createdAt: Date.now(),
    });
    if (!device.success) {
      setError(errorMessage(new dp.DataProviderError("invalid-argument")));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await provider.createDevice(device.data);
      const { station } = access.data;
      if (station.visibility === "public" && station.ownerUid === user.uid) {
        // The public projection counts devices; only the owner may refresh it (rules). The device
        // exists either way, so a failed refresh is reported to developers, not shown as a failure.
        await provider.refreshPublicProjection(stationId).catch((cause: unknown) => {
          console.warn("public projection not refreshed", cause);
        });
      }
      router.replace(`/app/station?id=${encodeURIComponent(stationId)}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (stationId === null || stationId === "") {
    return <p role="alert">{t("devices.missingStation")}</p>;
  }
  if (access.status === "loading") {
    return <p role="status">{t("state.loading")}</p>;
  }
  if (access.status === "error") {
    return (
      <div className="space-y-4">
        <p role="alert">{access.error}</p>
        <Link className="underline" href={`/app/station?id=${encodeURIComponent(stationId)}`}>
          {t("station.backToStation")}
        </Link>
      </div>
    );
  }

  const types = access.data.types;

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-semibold">{t("devices.newTitle")}</h1>
      <p className="text-secondary">{access.data.station.name}</p>
      {error && <p role="alert">{error}</p>}
      <form className="space-y-6" onSubmit={submit} noValidate>
        <Field id="device-label" name="label" label={t("devices.field.label")} required />
        <SelectField
          id="device-type"
          name="deviceType"
          label={t("devices.field.type")}
          required
          defaultValue=""
        >
          <option value="" disabled>
            {t("devices.chooseType")}
          </option>
          {types.map((type) => (
            <option key={`${type.id}:${type.version}`} value={`${type.id}:${type.version}`}>
              {type.name}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-6 md:grid-cols-2">
          <Field
            id="device-area"
            name="activeAreaCm2"
            type="number"
            step="any"
            label={t("devices.field.activeArea")}
            defaultValue="25"
            required
          />
          <Field
            id="device-thickness"
            name="thicknessCm"
            type="number"
            step="any"
            label={t("devices.field.thickness")}
            defaultValue="1"
            required
          />
          <Field
            id="device-material"
            name="material"
            label={t("devices.field.material")}
            defaultValue="plastic scintillator"
            required
          />
          <SelectField
            id="device-orientation"
            name="orientation"
            label={t("devices.field.orientation")}
            defaultValue="horizontal"
          >
            <option value="horizontal">{t("devices.orientation.horizontal")}</option>
            <option value="vertical">{t("devices.orientation.vertical")}</option>
            <option value="tilted">{t("devices.orientation.tilted")}</option>
          </SelectField>
          <Field
            id="device-tilt"
            name="tiltDeg"
            type="number"
            step="any"
            label={t("devices.field.tilt")}
          />
          <SelectField
            id="device-status"
            name="status"
            label={t("devices.field.status")}
            defaultValue="active"
          >
            <option value="active">{t("devices.status.active")}</option>
            <option value="inactive">{t("devices.status.inactive")}</option>
            <option value="retired">{t("devices.status.retired")}</option>
          </SelectField>
        </div>
        <Button size="lg" type="submit" disabled={busy || types.length === 0}>
          {t("devices.createSubmit")}
        </Button>
      </form>
      <Link className="underline" href={`/app/station?id=${encodeURIComponent(stationId)}`}>
        {t("station.backToStation")}
      </Link>
    </div>
  );
}
