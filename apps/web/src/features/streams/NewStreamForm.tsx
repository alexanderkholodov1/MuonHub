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
import { SelectField } from "@/features/stations/form-fields";
import { canManageDevicesAndStreams, resolveStationRole } from "@/features/stations/resolve-role";

export function NewStreamForm(): ReactNode {
  const provider = useDataProvider();
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const stationId = params.get("station");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key =
    provider !== null && user !== null && stationId !== null
      ? `${stationId}:${user.uid}:stream`
      : null;
  const access = useResource(key, async () => {
    if (provider === null || user === null || stationId === null) {
      throw new dp.DataProviderError("invalid-argument");
    }
    const station = await provider.getStation(stationId);
    if (station === null) throw new dp.DataProviderError("not-found");
    const role = await resolveStationRole(provider, station, user.uid);
    if (!canManageDevicesAndStreams(role)) throw new dp.DataProviderError("permission-denied");
    const devices = await provider.listDevices(stationId);
    return { station, devices: devices.items };
  });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (provider === null || user === null || stationId === null || busy) return;
    if (access.status !== "ready") return;
    const data = new FormData(event.currentTarget);
    const stream = v2.StreamSchema.safeParse({
      schemaVersion: 2,
      id: dp.newStreamId(),
      ownerUid: user.uid,
      stationId,
      deviceId: String(data.get("deviceId")),
      status: String(data.get("status")) as v2.Stream["status"],
      createdAt: Date.now(),
    });
    if (!stream.success) {
      setError(errorMessage(new dp.DataProviderError("invalid-argument")));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await provider.createStream(stream.data);
      router.replace(`/app/station?id=${encodeURIComponent(stationId)}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  // The page keeps its heading in every state, so assistive technology always finds it.
  const heading = <h1 className="text-4xl font-semibold">{t("streams.newTitle")}</h1>;
  if (stationId === null || stationId === "") {
    return (
      <div className="space-y-8">
        {heading}
        <p role="alert">{t("streams.missingStation")}</p>
      </div>
    );
  }
  if (access.status === "loading") {
    return (
      <div className="space-y-8">
        {heading}
        <p role="status">{t("state.loading")}</p>
      </div>
    );
  }
  if (access.status === "error") {
    return (
      <div className="space-y-8">
        {heading}
        <p role="alert">{access.error}</p>
        <Link className="underline" href={`/app/station?id=${encodeURIComponent(stationId)}`}>
          {t("station.backToStation")}
        </Link>
      </div>
    );
  }

  const { station, devices } = access.data;

  return (
    <div className="space-y-8">
      {heading}
      <p className="text-secondary">{station.name}</p>
      {error && <p role="alert">{error}</p>}
      {devices.length === 0 ? (
        <p className="text-secondary">{t("streams.needDevice")}</p>
      ) : (
        <form className="space-y-6" onSubmit={submit} noValidate>
          <SelectField
            id="stream-device"
            name="deviceId"
            label={t("streams.field.device")}
            required
            defaultValue=""
          >
            <option value="" disabled>
              {t("streams.chooseDevice")}
            </option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="stream-status"
            name="status"
            label={t("streams.field.status")}
            defaultValue="active"
          >
            <option value="active">{t("streams.status.active")}</option>
            <option value="stopped">{t("streams.status.stopped")}</option>
          </SelectField>
          <Button size="lg" type="submit" disabled={busy}>
            {t("streams.createSubmit")}
          </Button>
        </form>
      )}
      <Link className="underline" href={`/app/station?id=${encodeURIComponent(stationId)}`}>
        {t("station.backToStation")}
      </Link>
    </div>
  );
}
