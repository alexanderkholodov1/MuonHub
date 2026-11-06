import { describe, expect, it } from "vitest";
import { PublicProfileSchema, UserSchema, toPublicProfile } from "./identity.js";

const user = UserSchema.parse({
  schemaVersion: 2,
  uid: "ownerA",
  displayName: "Ada",
  username: "ada",
  email: "ada@example.org",
  createdAt: 1_700_000_000_000,
});

describe("public profile", () => {
  it("copies the display name and username, never the email", () => {
    const projection = toPublicProfile(user, 1_700_000_001_000);
    expect(PublicProfileSchema.parse(projection)).toEqual({
      schemaVersion: 2,
      uid: "ownerA",
      displayName: "Ada",
      username: "ada",
      updatedAt: 1_700_000_001_000,
    });
    expect(Object.keys(projection)).not.toContain("email");
  });

  it("rejects a projection that carries the email or any other field", () => {
    const projection = toPublicProfile(user, 1_700_000_001_000);
    expect(PublicProfileSchema.safeParse({ ...projection, email: user.email }).success).toBe(false);
    expect(PublicProfileSchema.safeParse({ ...projection, role: "admin" }).success).toBe(false);
  });
});
