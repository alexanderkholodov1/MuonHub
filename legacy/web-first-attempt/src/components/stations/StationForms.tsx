"use client";

import React, { useMemo, useState } from "react";
import type {
  Calibration,
  Detector,
  HardwareVersion,
  Station,
  StationPlacement,
  StationType,
  Visibility,
} from "@muonhub/shared";
import { DetectorSchema, StationSchema } from "@muonhub/shared";
import { AlertTriangle, RotateCcw, Wand2 } from "lucide-react";
import { Button, Card } from "@muonhub/ui";
import { getDataProvider } from "../../lib/data-provider";
import {
  HARDWARE_VERSION_OPTIONS,
  PLACEMENT_OPTIONS,
  STATION_TYPE_OPTIONS,
  VISIBILITY_OPTIONS,
  calibrationValuesForHardware,
  generateDeviceToken,
  generateEntityId,
  hasDetectorTokenConsistencyAdvisory,
  missingOptionalStationMetadata,
} from "./station-utils";

type StationField =
  | "name"
  | "visibility"
  | "latitude"
  | "longitude"
  | "altitudeM"
  | "city"
  | "country"
  | "placement"
  | "type"
  | "timezone"
  | "floor"
  | "shielding"
  | "orientation"
  | "notes";

type DetectorField =
  | "label"
  | "hardwareModel"
  | "firmwareVersion"
  | "hwVersion"
  | "sipmCount"
  | "adcSlope"
  | "adcIntercept"
  | "saturationMv"
  | "triggerAdcMin";

type FieldErrors<TField extends string> = Partial<Record<TField, string>>;

interface SchemaIssue {
  path: PropertyKey[];
  message: string;
}

interface SchemaError {
  issues: SchemaIssue[];
}

interface StationFormValues {
  name: string;
  visibility: Visibility | "";
  latitude: string;
  longitude: string;
  altitudeM: string;
  city: string;
  country: string;
  placement: StationPlacement | "";
  type: StationType | "";
  timezone: string;
  floor: string;
  shielding: string;
  orientation: string;
  notes: string;
}

interface DetectorFormValues {
  label: string;
  hardwareModel: string;
  firmwareVersion: string;
  hwVersion: HardwareVersion;
  sipmCount: string;
  adcSlope: string;
  adcIntercept: string;
  saturationMv: string;
  triggerAdcMin: string;
}

interface StationFormProps {
  ownerUid: string;
  mode: "create" | "edit";
  initialStation?: Station;
  onSaved: (station: Station) => void;
}

interface DetectorRegistrationFormProps {
  stationId: string;
  existingDetectors: Detector[];
  onSaved: (detector: Detector) => void;
}

const STATION_FIELDS = [
  "name",
  "visibility",
  "latitude",
  "longitude",
  "altitudeM",
  "city",
  "country",
  "placement",
  "type",
  "timezone",
  "floor",
  "shielding",
  "orientation",
  "notes",
] as const satisfies readonly StationField[];

const DETECTOR_FIELDS = [
  "label",
  "hardwareModel",
  "firmwareVersion",
  "hwVersion",
  "sipmCount",
  "adcSlope",
  "adcIntercept",
  "saturationMv",
  "triggerAdcMin",
] as const satisfies readonly DetectorField[];

const INPUT_CLASS =
  "min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-base text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]";

const SELECT_CLASS = INPUT_CLASS;

const TEXTAREA_CLASS =
  "min-h-24 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-base text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]";

const LABEL_CLASS = "mb-2 block text-sm font-medium text-[var(--color-text)]";
const HELP_CLASS = "mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]";
const ERROR_CLASS = "mt-2 text-sm text-[var(--color-danger)]";

function initialStationValues(station?: Station): StationFormValues {
  return {
    name: station?.name ?? "",
    visibility: station?.visibility ?? "",
    latitude: station == null ? "" : String(station.latitude),
    longitude: station == null ? "" : String(station.longitude),
    altitudeM: station == null ? "" : String(station.altitudeM),
    city: station?.city ?? "",
    country: station?.country ?? "",
    placement: station?.placement ?? "",
    type: station?.type ?? "",
    timezone: station?.timezone ?? "",
    floor: station?.floor ?? "",
    shielding: station?.shielding ?? "",
    orientation: station?.orientation ?? "",
    notes: station?.notes ?? "",
  };
}

function initialDetectorValues(hwVersion: HardwareVersion = "unknown"): DetectorFormValues {
  return {
    label: "",
    hardwareModel: "",
    firmwareVersion: "",
    hwVersion,
    sipmCount: "1",
    ...calibrationValuesForHardware(hwVersion),
  };
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function numberFromInput(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

function stationFieldFromPath(path: PropertyKey[]): StationField | null {
  const key = path[0];
  if (typeof key !== "string") return null;
  return STATION_FIELDS.includes(key as StationField) ? (key as StationField) : null;
}

function detectorFieldFromIssue(issue: SchemaIssue): DetectorField | null {
  const [first, second, third] = issue.path;
  if (first === "calibration") {
    if (second === "adcToMv" && third === 0) return "adcSlope";
    if (second === "adcToMv" && third === 1) return "adcIntercept";
    if (second === "saturationMv") return "saturationMv";
    if (second === "triggerAdcMin") return "triggerAdcMin";
  }
  if (typeof first !== "string") return null;
  return DETECTOR_FIELDS.includes(first as DetectorField) ? (first as DetectorField) : null;
}

function stationErrorsFromZod(error: SchemaError): FieldErrors<StationField> {
  const errors: FieldErrors<StationField> = {};
  for (const issue of error.issues) {
    const field = stationFieldFromPath(issue.path);
    if (field != null && errors[field] == null) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

function detectorErrorsFromZod(error: SchemaError): FieldErrors<DetectorField> {
  const errors: FieldErrors<DetectorField> = {};
  for (const issue of error.issues) {
    const field = detectorFieldFromIssue(issue);
    if (field != null && errors[field] == null) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

function stationRequiredFieldsComplete(values: StationFormValues): boolean {
  return (
    values.name.trim() !== "" &&
    values.visibility !== "" &&
    values.latitude.trim() !== "" &&
    values.longitude.trim() !== "" &&
    values.altitudeM.trim() !== "" &&
    values.city.trim() !== "" &&
    values.country.trim() !== "" &&
    values.placement !== "" &&
    values.type !== "" &&
    values.timezone.trim() !== ""
  );
}

function detectorRequiredFieldsComplete(values: DetectorFormValues): boolean {
  return (
    values.hardwareModel.trim() !== "" &&
    values.firmwareVersion.trim() !== "" &&
    values.sipmCount.trim() !== "" &&
    values.adcSlope.trim() !== "" &&
    values.adcIntercept.trim() !== "" &&
    values.saturationMv.trim() !== "" &&
    values.triggerAdcMin.trim() !== ""
  );
}

export function StationForm({
  ownerUid,
  mode,
  initialStation,
  onSaved,
}: StationFormProps): React.ReactElement {
  const [values, setValues] = useState<StationFormValues>(() =>
    initialStationValues(initialStation),
  );
  const [errors, setErrors] = useState<FieldErrors<StationField>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const missingOptional = useMemo(() => {
    if (initialStation == null) return [];
    return missingOptionalStationMetadata(initialStation);
  }, [initialStation]);

  function updateField(field: StationField, value: string): void {
    setValues((current) => ({
      ...current,
      [field]: field === "country" ? value.toUpperCase() : value,
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
    setSuccessMessage(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (values.visibility === "") {
      setErrors((current) => ({
        ...current,
        visibility: "Choose public, institution, or private visibility before saving.",
      }));
      return;
    }

    const rawStation: Record<string, unknown> = {
      id: initialStation?.id ?? generateEntityId("st"),
      name: values.name.trim(),
      ownerUid,
      institutionId: initialStation?.institutionId ?? null,
      visibility: values.visibility,
      embargoUntil: initialStation?.embargoUntil ?? null,
      latitude: numberFromInput(values.latitude),
      longitude: numberFromInput(values.longitude),
      altitudeM: numberFromInput(values.altitudeM),
      city: values.city.trim(),
      country: values.country.trim().toUpperCase(),
      placement: values.placement,
      type: values.type,
      timezone: values.timezone.trim(),
      shares: initialStation?.shares ?? [],
      createdAt: initialStation?.createdAt ?? Date.now(),
    };

    const floor = optionalText(values.floor);
    const shielding = optionalText(values.shielding);
    const orientation = optionalText(values.orientation);
    const notes = optionalText(values.notes);
    if (floor != null) rawStation.floor = floor;
    if (shielding != null) rawStation.shielding = shielding;
    if (orientation != null) rawStation.orientation = orientation;
    if (notes != null) rawStation.notes = notes;
    if (initialStation?.mlTrainingOptOut != null) {
      rawStation.mlTrainingOptOut = initialStation.mlTrainingOptOut;
    }

    const parsed = StationSchema.safeParse(rawStation);
    if (!parsed.success) {
      setErrors(stationErrorsFromZod(parsed.error));
      setFormError("Review the highlighted station metadata fields.");
      return;
    }

    setSubmitting(true);
    try {
      const provider = await getDataProvider();
      await provider.upsertStation(parsed.data);
      setSuccessMessage(mode === "create" ? "Station saved." : "Station metadata updated.");
      onSaved(parsed.data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Station could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title={mode === "create" ? "Create station" : "Edit station metadata"}>
      {missingOptional.length > 0 && (
        <NonBlockingNotice
          title="Metadata completion reminder"
          tone="warning"
          body={`Optional metadata still missing: ${missingOptional.join(", ")}. Complete it when available to improve future corrections and station context.`}
        />
      )}

      {formError != null && (
        <div
          className="mb-6 rounded-md border border-[var(--color-danger)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-text)]"
          role="alert"
        >
          {formError}
        </div>
      )}

      {successMessage != null && (
        <div
          className="mb-6 rounded-md border border-[var(--color-success)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-text)]"
          role="status"
        >
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Station name" error={errors.name}>
            <input
              className={INPUT_CLASS}
              value={values.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
            />
          </Field>

          <Field
            label="Timezone"
            error={errors.timezone}
            help="Use an IANA name, for example America/Guayaquil."
          >
            <input
              className={INPUT_CLASS}
              value={values.timezone}
              onChange={(event) => updateField("timezone", event.target.value)}
              required
            />
          </Field>

          <Field label="City" error={errors.city}>
            <input
              className={INPUT_CLASS}
              value={values.city}
              onChange={(event) => updateField("city", event.target.value)}
              required
            />
          </Field>

          <Field
            label="Country code"
            error={errors.country}
            help="ISO-3166 alpha-2, for example EC."
          >
            <input
              className={INPUT_CLASS}
              value={values.country}
              onChange={(event) => updateField("country", event.target.value)}
              maxLength={2}
              required
            />
          </Field>

          <Field label="Latitude" error={errors.latitude}>
            <input
              className={INPUT_CLASS}
              value={values.latitude}
              onChange={(event) => updateField("latitude", event.target.value)}
              inputMode="decimal"
              required
            />
          </Field>

          <Field label="Longitude" error={errors.longitude}>
            <input
              className={INPUT_CLASS}
              value={values.longitude}
              onChange={(event) => updateField("longitude", event.target.value)}
              inputMode="decimal"
              required
            />
          </Field>

          <Field label="Altitude" error={errors.altitudeM} help="Meters above sea level.">
            <input
              className={INPUT_CLASS}
              value={values.altitudeM}
              onChange={(event) => updateField("altitudeM", event.target.value)}
              inputMode="decimal"
              required
            />
          </Field>

          <Field label="Placement" error={errors.placement}>
            <select
              className={SELECT_CLASS}
              value={values.placement}
              onChange={(event) => updateField("placement", event.target.value)}
              required
            >
              <option value="">Choose placement</option>
              {PLACEMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="mt-6 rounded-lg border border-[var(--color-border)] p-4">
          <legend className="px-2 text-sm font-medium text-[var(--color-text)]">
            Visibility — choose explicitly
          </legend>
          <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            No visibility is pre-selected. Choose how this station should appear as sharing features
            land.
          </p>
          {errors.visibility != null && <p className={ERROR_CLASS}>{errors.visibility}</p>}
          <div className="grid gap-3 md:grid-cols-3">
            {VISIBILITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-text)]"
              >
                <input
                  className="mr-3"
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={values.visibility === option.value}
                  onChange={() => updateField("visibility", option.value)}
                />
                <span className="font-medium">{option.label}</span>
                <span className="mt-2 block leading-relaxed text-[var(--color-text-secondary)]">
                  {option.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6 rounded-lg border border-[var(--color-border)] p-4">
          <legend className="px-2 text-sm font-medium text-[var(--color-text)]">
            Station type
          </legend>
          {errors.type != null && <p className={ERROR_CLASS}>{errors.type}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {STATION_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-text)]"
              >
                <input
                  className="mr-3"
                  type="radio"
                  name="type"
                  value={option.value}
                  checked={values.type === option.value}
                  onChange={() => updateField("type", option.value)}
                />
                <span className="font-medium">{option.label}</span>
                <span className="mt-2 block leading-relaxed text-[var(--color-text-secondary)]">
                  {option.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field label="Floor" error={errors.floor} optional>
            <input
              className={INPUT_CLASS}
              value={values.floor}
              onChange={(event) => updateField("floor", event.target.value)}
            />
          </Field>

          <Field label="Shielding" error={errors.shielding} optional>
            <input
              className={INPUT_CLASS}
              value={values.shielding}
              onChange={(event) => updateField("shielding", event.target.value)}
            />
          </Field>

          <Field label="Orientation" error={errors.orientation} optional>
            <input
              className={INPUT_CLASS}
              value={values.orientation}
              onChange={(event) => updateField("orientation", event.target.value)}
            />
          </Field>

          <Field label="Notes" error={errors.notes} optional>
            <textarea
              className={TEXTAREA_CLASS}
              value={values.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            loading={submitting}
            disabled={!stationRequiredFieldsComplete(values)}
          >
            {mode === "create" ? "Save station" : "Save metadata"}
          </Button>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Owner is fixed to the signed-in user and is never editable.
          </p>
        </div>
      </form>
    </Card>
  );
}

export function DetectorRegistrationForm({
  stationId,
  existingDetectors,
  onSaved,
}: DetectorRegistrationFormProps): React.ReactElement {
  const [values, setValues] = useState<DetectorFormValues>(() => initialDetectorValues());
  const [deviceToken, setDeviceToken] = useState(() => generateDeviceToken());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<DetectorField>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const consistencyAdvisory = hasDetectorTokenConsistencyAdvisory(existingDetectors, deviceToken);

  function updateField(field: DetectorField, value: string): void {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
    setSuccessMessage(null);
  }

  function updateHardware(hwVersion: HardwareVersion): void {
    setValues((current) => ({
      ...current,
      hwVersion,
      ...calibrationValuesForHardware(hwVersion),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next.hwVersion;
      delete next.adcSlope;
      delete next.adcIntercept;
      delete next.saturationMv;
      delete next.triggerAdcMin;
      return next;
    });
    setSuccessMessage(null);
  }

  function resetCalibration(): void {
    setValues((current) => ({
      ...current,
      ...calibrationValuesForHardware(current.hwVersion),
    }));
    setSuccessMessage("Calibration reset to the selected hardware defaults.");
  }

  function regenerateToken(): void {
    setDeviceToken(generateDeviceToken());
    setSuccessMessage("A new device token was generated.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const adcSlope = numberFromInput(values.adcSlope);
    const adcIntercept = numberFromInput(values.adcIntercept);
    const saturationMv = numberFromInput(values.saturationMv);
    const triggerAdcMin = numberFromInput(values.triggerAdcMin);
    const calibration: Calibration = {
      adcToMv: [adcSlope, adcIntercept],
      saturationMv,
      triggerAdcMin,
    };

    const rawDetector: Record<string, unknown> = {
      id: generateEntityId("det"),
      stationId,
      deviceToken,
      hardwareModel: values.hardwareModel.trim(),
      firmwareVersion: values.firmwareVersion.trim(),
      hwVersion: values.hwVersion,
      sipmCount: numberFromInput(values.sipmCount),
      calibration,
      status: "active",
      addedAt: Date.now(),
    };

    const label = optionalText(values.label);
    if (label != null) rawDetector.label = label;

    const parsed = DetectorSchema.safeParse(rawDetector);
    if (!parsed.success) {
      setErrors(detectorErrorsFromZod(parsed.error));
      setFormError("Review the highlighted detector fields.");
      return;
    }

    setSubmitting(true);
    try {
      const provider = await getDataProvider();
      await provider.upsertDetector(parsed.data);
      setSuccessMessage(
        consistencyAdvisory
          ? "Detector saved. Review the device-token consistency advisory below."
          : "Detector saved.",
      );
      setValues(initialDetectorValues(values.hwVersion));
      setDeviceToken(generateDeviceToken());
      onSaved(parsed.data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Detector could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Register detector">
      {consistencyAdvisory && (
        <NonBlockingNotice
          title="Device-token consistency advisory"
          tone="warning"
          body="This station already has a detector with a different device token. If this is a separate physical site, create a new station; if it is a multi-detector setup, you can continue."
        />
      )}

      {formError != null && (
        <div
          className="mb-6 rounded-md border border-[var(--color-danger)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-text)]"
          role="alert"
        >
          {formError}
        </div>
      )}

      {successMessage != null && (
        <div
          className="mb-6 rounded-md border border-[var(--color-success)] bg-[var(--color-surface-2)] p-4 text-sm text-[var(--color-text)]"
          role="status"
        >
          {successMessage}
        </div>
      )}

      <div className="mb-6 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <p className="text-sm font-medium text-[var(--color-text)]">Auto-generated device token</p>
        <p className="mt-2 break-all font-mono text-base text-[var(--color-accent)]">
          {deviceToken}
        </p>
        <p className={HELP_CLASS}>
          Token generation is local and non-blocking; it can be regenerated before saving.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-4"
          icon={<Wand2 size={14} aria-hidden="true" />}
          onClick={regenerateToken}
        >
          Generate new token
        </Button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Detector label" error={errors.label} optional>
            <input
              className={INPUT_CLASS}
              value={values.label}
              onChange={(event) => updateField("label", event.target.value)}
            />
          </Field>

          <Field label="Hardware model" error={errors.hardwareModel}>
            <input
              className={INPUT_CLASS}
              value={values.hardwareModel}
              onChange={(event) => updateField("hardwareModel", event.target.value)}
              required
            />
          </Field>

          <Field label="Firmware version" error={errors.firmwareVersion}>
            <input
              className={INPUT_CLASS}
              value={values.firmwareVersion}
              onChange={(event) => updateField("firmwareVersion", event.target.value)}
              required
            />
          </Field>

          <Field label="Hardware version" error={errors.hwVersion}>
            <select
              className={SELECT_CLASS}
              value={values.hwVersion}
              onChange={(event) => updateHardware(event.target.value as HardwareVersion)}
            >
              {HARDWARE_VERSION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="SiPM count" error={errors.sipmCount}>
            <input
              className={INPUT_CLASS}
              value={values.sipmCount}
              onChange={(event) => updateField("sipmCount", event.target.value)}
              inputMode="numeric"
              required
            />
          </Field>
        </div>

        <details
          className="mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-base font-medium text-[var(--color-text)]">
            Advanced calibration
          </summary>
          <p className={HELP_CLASS}>
            Defaults come from the selected hardware version. Edit only when the physical detector
            calibration is known.
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Field label="ADC slope to mV" error={errors.adcSlope}>
              <input
                className={INPUT_CLASS}
                value={values.adcSlope}
                onChange={(event) => updateField("adcSlope", event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="ADC intercept to mV" error={errors.adcIntercept}>
              <input
                className={INPUT_CLASS}
                value={values.adcIntercept}
                onChange={(event) => updateField("adcIntercept", event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Saturation (mV)" error={errors.saturationMv}>
              <input
                className={INPUT_CLASS}
                value={values.saturationMv}
                onChange={(event) => updateField("saturationMv", event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Trigger ADC minimum" error={errors.triggerAdcMin}>
              <input
                className={INPUT_CLASS}
                value={values.triggerAdcMin}
                onChange={(event) => updateField("triggerAdcMin", event.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-6"
            icon={<RotateCcw size={14} aria-hidden="true" />}
            onClick={resetCalibration}
          >
            Reset to defaults
          </Button>
        </details>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            loading={submitting}
            disabled={!detectorRequiredFieldsComplete(values)}
          >
            Save detector
          </Button>
          <p className="text-sm text-[var(--color-text-secondary)]">
            The detector is stored under this station and indexed by detector id.
          </p>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  children,
  error,
  help,
  optional = false,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | undefined;
  help?: string | undefined;
  optional?: boolean | undefined;
}): React.ReactElement {
  return (
    <label className="block">
      <span className={LABEL_CLASS}>
        {label}
        {optional && <span className="ml-2 text-[var(--color-text-muted)]">(optional)</span>}
      </span>
      {children}
      {help != null && <span className={HELP_CLASS}>{help}</span>}
      {error != null && <span className={ERROR_CLASS}>{error}</span>}
    </label>
  );
}

function NonBlockingNotice({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "warning" | "info";
}): React.ReactElement {
  const borderClass =
    tone === "warning" ? "border-[var(--color-warning)]" : "border-[var(--color-accent)]";
  const iconClass =
    tone === "warning" ? "text-[var(--color-warning)]" : "text-[var(--color-accent)]";

  return (
    <div className={`mb-6 rounded-md border ${borderClass} bg-[var(--color-surface-2)] p-4`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-1 shrink-0 ${iconClass}`} size={18} aria-hidden="true" />
        <div>
          <p className="text-base font-medium text-[var(--color-text)]">{title}</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{body}</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            This notice does not block saving.
          </p>
        </div>
      </div>
    </div>
  );
}
