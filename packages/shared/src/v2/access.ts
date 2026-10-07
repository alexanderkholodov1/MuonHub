/**
 * Authorization mirror in the Realtime Database (spec 0084 FR15): RTDB rules cannot read Firestore,
 * so each station's access list is mirrored. Admins (Firestore) and audit entries are here too.
 */
import { z } from "zod";
import { EpochMsSchema, IdSchema, SchemaVersionSchema, UidSchema } from "./primitives.js";

const UidSet = z.record(UidSchema, z.literal(true));

/** `stationAccess/{stationId}` (RTDB). */
export const StationAccessSchema = z.strictObject({
  ownerUid: UidSchema,
  editors: UidSet.optional(),
  viewers: UidSet.optional(),
  public: z.boolean(),
  pendingOwner: UidSchema.optional(),
});

/** `streamStation/{streamId}` (RTDB) — the station id, create-once. */
export const StreamStationSchema = IdSchema;

/** `admins/{uid}` (Firestore). */
export const AdminEntrySchema = z.strictObject({
  uid: UidSchema,
  addedBy: UidSchema,
  addedAt: EpochMsSchema,
});

export const AuditActionSchema = z.enum([
  "membershipChange",
  "visibilityChange",
  "ownershipTransfer",
  "adminChange",
  "deviceTypeStatusChange",
]);

/** `audit/{id}` (Firestore) — append-only, defined action types, bounded payload. */
export const AuditEntrySchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  id: IdSchema,
  action: AuditActionSchema,
  actorUid: UidSchema,
  targetId: IdSchema,
  details: z
    .record(z.string().max(64), z.union([z.string().max(256), z.number(), z.boolean()]))
    .refine((d) => Object.keys(d).length <= 16, { message: "at most 16 detail fields" })
    .optional(),
  createdAt: EpochMsSchema,
});

export type StationAccess = z.infer<typeof StationAccessSchema>;
export type AdminEntry = z.infer<typeof AdminEntrySchema>;
export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
