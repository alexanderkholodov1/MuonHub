/**
 * First-time setup wizard backend (spec 0087 FR15, decision E): sign in (the password is used once
 * and discarded — only the refresh token is kept), create or select a station (visibility required,
 * no default; public precision), device (device type, geometry) and stream, then save the binding the
 * daemon reads at startup. Everything goes through `@muonhub/data-provider`.
 */
import { writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import { BindingSchema } from "../config.js";
import type { AuthManager } from "../sync/auth.js";

export interface SetupApi {
  readonly deviceTypes: { id: string; name: string }[];
  currentEmail(): string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  listStations(): Promise<{ id: string; name: string }[]>;
  bind(fields: Record<string, string>): Promise<{ message: string }>;
}

function num(fields: Record<string, string>, key: string): number {
  const v = Number((fields[key] ?? "").trim());
  if (!Number.isFinite(v) || (fields[key] ?? "").trim() === "")
    throw new Error(`${key} must be a number.`);
  return v;
}

export function createSetupApi(o: {
  provider: dp.DataProviderV2;
  auth: AuthManager;
  deviceTypes: readonly v2.DeviceType[];
  bindingPath: string;
  now?: () => number;
  onBound?: () => void;
}): SetupApi {
  const now = o.now ?? Date.now;
  return {
    deviceTypes: o.deviceTypes.map((t) => ({ id: t.id, name: t.name })),
    currentEmail: () => o.provider.currentUser()?.email ?? null,
    async signIn(email, password) {
      await o.auth.signIn(email.trim(), password);
    },
    async signOut() {
      await o.auth.signOut();
    },
    async listStations() {
      const mine = await o.provider.listMyStations();
      const shared = await o.provider.listSharedWithMe();
      return [
        ...mine.items.map((s) => ({ id: s.id, name: s.name })),
        ...shared.items
          .filter((x) => x.role === "editor")
          .map((x) => ({ id: x.station.id, name: x.station.name })),
      ];
    },
    async bind(fields) {
      const user = o.provider.currentUser();
      if (user === null) throw new Error("You must sign in first.");
      const type = o.deviceTypes.find((t) => t.id === fields["deviceType"]);
      if (type === undefined) throw new Error("Choose a device type.");
      let stationId = (fields["stationId"] ?? "").trim();
      let ownerUid = user.uid;
      if (stationId === "") {
        const visibility = v2.VisibilitySchema.safeParse(fields["visibility"]);
        if (!visibility.success)
          throw new Error("Choose the visibility of the station (there is no default).");
        const precision = v2.PublicPrecisionSchema.safeParse(fields["precision"]);
        if (!precision.success) throw new Error("Choose the public location precision.");
        stationId = dp.newStationId();
        const station = v2.StationSchema.parse({
          schemaVersion: 2,
          id: stationId,
          ownerUid: user.uid,
          name: (fields["stationName"] ?? "").trim(),
          location: {
            lat: num(fields, "lat"),
            lon: num(fields, "lon"),
            altitudeM: num(fields, "altitudeM"),
            city: (fields["city"] ?? "").trim(),
            countryCode: (fields["countryCode"] ?? "").trim().toUpperCase(),
          },
          publicPrecision: precision.data,
          visibility: visibility.data,
          timezone: (fields["timezone"] ?? "").trim(),
          createdAt: now(),
          updatedAt: now(),
        });
        await o.provider.createStation(station);
      } else {
        const existing = await o.provider.getStation(stationId);
        if (existing === null) throw new Error("That station was not found.");
        ownerUid = existing.ownerUid;
      }
      const deviceId = `dev-${dp.newStreamId().slice(0, 12)}`;
      const device = v2.DeviceSchema.parse({
        schemaVersion: 2,
        id: deviceId,
        ownerUid,
        stationId,
        deviceType: { id: type.id, version: type.version },
        label: (fields["label"] ?? "").trim(),
        geometry: {
          activeAreaCm2: num(fields, "areaCm2"),
          thicknessCm: num(fields, "thicknessCm"),
          material: (fields["material"] ?? "").trim(),
          orientation: fields["orientation"] ?? "horizontal",
        },
        status: "active",
        createdAt: now(),
      });
      await o.provider.createDevice(device);
      const streamId = dp.newStreamId();
      await o.provider.createStream(
        v2.StreamSchema.parse({
          schemaVersion: 2,
          id: streamId,
          ownerUid,
          stationId,
          deviceId,
          status: "active",
          createdAt: now(),
        }),
      );
      const binding = BindingSchema.parse({ streamId, stationId, deviceId, deviceTypeId: type.id });
      mkdirSync(dirname(o.bindingPath), { recursive: true, mode: 0o700 });
      const tmp = `${o.bindingPath}.tmp`;
      writeFileSync(tmp, JSON.stringify(binding, null, 2) + "\n", { mode: 0o600 });
      renameSync(tmp, o.bindingPath);
      o.onBound?.();
      return { message: "Saved. The agent restarts to start recording into the new stream." };
    },
  };
}
