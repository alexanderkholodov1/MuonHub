import type { v2 as dp } from "@muonhub/data-provider";
import type { v2 } from "@muonhub/shared";

export type StationAccessRole = "owner" | v2.MemberRole | "non-member";

export async function resolveStationRole(
  provider: dp.DataProviderV2,
  station: v2.Station,
  uid: string,
): Promise<StationAccessRole> {
  if (station.ownerUid === uid) return "owner";
  const members = await provider.listMembers(station.id);
  const member = members.items.find((m) => m.uid === uid);
  return member?.role ?? "non-member";
}

export function canEditStationMetadata(role: StationAccessRole): boolean {
  return role === "owner";
}

export function canManageDevicesAndStreams(role: StationAccessRole): boolean {
  return role === "owner" || role === "editor";
}

export function canManageMembers(role: StationAccessRole): boolean {
  return role === "owner";
}
