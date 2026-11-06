"use client";

import React from "react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { v2 } from "@muonhub/shared";
import { v2 as dp } from "@muonhub/data-provider";
import { Button } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { errorMessage } from "@/lib/errors";
import { t } from "@/i18n/t";
import { useAuth } from "@/features/auth/AuthProvider";
import { Field, Fieldset, SelectField } from "./form-fields";

const VISIBILITY_OPTIONS: v2.Visibility[] = ["public", "institution", "private"];
const PRECISION_OPTIONS: v2.PublicPrecision[] = [
  "exact",
  "approximate",
  "city",
  "country",
  "hidden",
];

export function StationForm({
  mode,
  stationId,
  initial,
  onSaved,
}: {
  mode: "create" | "edit";
  stationId?: string;
  initial?: v2.Station;
  onSaved?: (station: v2.Station) => void;
}): ReactNode {
  const provider = useDataProvider();
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<v2.Visibility | "">(initial?.visibility ?? "");
  const [publicPrecision, setPublicPrecision] = useState<v2.PublicPrecision>(
    initial?.publicPrecision ?? "city",
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (provider === null || user === null || busy) return;
    setError(null);
    setVisibilityError(null);
    if (visibility === "") {
      setVisibilityError(t("station.visibilityRequired"));
      return;
    }
    const data = new FormData(event.currentTarget);
    const location = {
      lat: Number(data.get("lat")),
      lon: Number(data.get("lon")),
      altitudeM: Number(data.get("altitudeM")),
      city: String(data.get("city")).trim(),
      countryCode: String(data.get("countryCode")).trim().toUpperCase(),
    };
    const at = Date.now();
    const base = {
      schemaVersion: 2 as const,
      name: String(data.get("name")).trim(),
      location,
      publicPrecision,
      visibility,
      timezone: String(data.get("timezone")).trim(),
      updatedAt: at,
    };
    const parsed =
      mode === "create"
        ? v2.StationSchema.safeParse({
            ...base,
            id: dp.newStationId(),
            ownerUid: user.uid,
            createdAt: at,
          })
        : v2.StationSchema.safeParse({
            ...initial,
            ...base,
            id: stationId,
            ownerUid: initial!.ownerUid,
            createdAt: initial!.createdAt,
          });
    if (!parsed.success) {
      setError(errorMessage(new dp.DataProviderError("invalid-argument")));
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        await provider.createStation(parsed.data);
        if (onSaved) onSaved(parsed.data);
        else router.replace(`/app/station?id=${encodeURIComponent(parsed.data.id)}`);
      } else {
        await provider.updateStation(stationId!, {
          name: parsed.data.name,
          timezone: parsed.data.timezone,
          location: parsed.data.location,
          publicPrecision: parsed.data.publicPrecision,
          visibility: parsed.data.visibility,
        });
        if (onSaved) onSaved(parsed.data);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const defaultLat = initial?.location.lat ?? -0.22;
  const defaultLon = initial?.location.lon ?? -78.49;
  const defaultAlt = initial?.location.altitudeM ?? 2850;
  const defaultCity = initial?.location.city ?? "Quito";
  const defaultCountry = initial?.location.countryCode ?? "EC";
  const defaultTz = initial?.timezone ?? "America/Guayaquil";
  const defaultName = initial?.name ?? "";

  return (
    <form className="space-y-6" onSubmit={submit} noValidate>
      {error && <p role="alert">{error}</p>}
      <Field
        id="station-name"
        name="name"
        label={t("station.field.name")}
        defaultValue={defaultName}
        required
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Field
          id="station-lat"
          name="lat"
          type="number"
          step="any"
          label={t("station.field.lat")}
          defaultValue={String(defaultLat)}
          required
        />
        <Field
          id="station-lon"
          name="lon"
          type="number"
          step="any"
          label={t("station.field.lon")}
          defaultValue={String(defaultLon)}
          required
        />
        <Field
          id="station-altitude"
          name="altitudeM"
          type="number"
          step="any"
          label={t("station.field.altitude")}
          defaultValue={String(defaultAlt)}
          required
        />
        <Field
          id="station-city"
          name="city"
          label={t("station.field.city")}
          defaultValue={defaultCity}
          required
        />
        <Field
          id="station-country"
          name="countryCode"
          label={t("station.field.country")}
          defaultValue={defaultCountry}
          maxLength={2}
          required
        />
        <Field
          id="station-timezone"
          name="timezone"
          label={t("station.field.timezone")}
          defaultValue={defaultTz}
          required
        />
      </div>
      <Fieldset legend={t("station.field.visibility")} error={visibilityError}>
        <div className="space-y-3">
          {VISIBILITY_OPTIONS.map((value) => (
            <label key={value} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="visibilityChoice"
                value={value}
                checked={visibility === value}
                onChange={() => setVisibility(value)}
              />
              <span>{t(`station.visibility.${value}`)}</span>
            </label>
          ))}
        </div>
      </Fieldset>
      <SelectField
        id="station-precision"
        label={t("station.field.publicPrecision")}
        value={publicPrecision}
        onChange={(event) => setPublicPrecision(event.target.value as v2.PublicPrecision)}
      >
        {PRECISION_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {t(`station.precision.${value}`)}
          </option>
        ))}
      </SelectField>
      <Button size="lg" type="submit" disabled={busy || visibility === ""}>
        {mode === "create" ? t("station.createSubmit") : t("station.saveChanges")}
      </Button>
    </form>
  );
}
