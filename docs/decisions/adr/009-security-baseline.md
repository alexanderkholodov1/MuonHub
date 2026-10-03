# ADR-009 — Security baseline

- **Status:** Accepted in principle — the maintainer required closing every security hole
  (2026-10-02); the specific rules below are **Proposed** until he confirms them.
- **Date:** 2026-10-03
- **Reinforces:** D39. **Applies to:** every milestone from M1 on.

## Context

The 2026-10-02 audit of the first v6 attempt found that its rules and data layer allowed:

- a user to grant themselves the admin role;
- an editor to take over or delete a station;
- anonymous visitors to download full station records, including exact coordinates and
  collaborator IDs;
- the device index to be hijacked;
- any signed-in user to read and write object storage;
- arbitrary data shapes, because nothing was validated.

None of this was caught, because the tests used the administrative target, which bypasses the
security rules. The maintainer's instruction: **close every hole; nothing like this may ship.**

## Decision

### Principles
1. **Deny by default.** Every path and collection is closed unless a rule opens it for a stated
   reason.
2. **Validate every field** in the security rules: type, range, allowed keys, and no unexpected
   keys. Writes that do not match the schema are rejected; they are never stored for later
   cleanup.
3. **Owner-only, immutable fields.** Ownership, roles, sharing lists, and visibility are writable
   only by the owner, or by an admin through the trusted path. Ownership cannot be reassigned by
   an editor.
4. **Roles are custom claims set by a trusted script** that runs on the maintainer's machine or in
   CI. They are never written from a browser. The client never trusts a role field stored in a
   user-writable document.
5. **Public data only through dedicated public projections.**
   - Anonymous visitors read only purpose-built public documents and windows: station cards,
     aggregates, and the live showcase (ADR-005).
   - These contain **no personal data** (no emails, names of private users, user IDs of
     collaborators, or notes).
   - No collection-level public read is ever granted over private records.
6. **Location privacy:** exact coordinates are stored privately. The public projection carries only
   the precision the owner chose (exact / approximate / city / country / hidden), and the rules
   enforce it (amends D20).
7. **App Check** protects both databases; it runs in monitor mode first, then is enforced.
8. **No admin keys on agent machines.** The agent signs in with the user's own account
   (ADR-007). Service-account keys live only in `private/` (git-ignored) or in CI secrets.
9. **Safe error messages:** users never see raw backend errors (e.g. `PERMISSION_DENIED` strings).
   Errors are mapped to clear, non-revealing messages.
10. **Secrets never enter the repository;** the gitleaks scan runs on every PR.

### Verification
- **Tests with real identities:** the rules are tested in the Firebase emulator with **real client
  identities** — anonymous, signed-in stranger, viewer, editor, owner, admin — never only with the
  administrative target.
- **Negative tests:** every rule has tests of who must **not** be able to do something, including
  **anonymous reads of every collection and path**.
- **Every query the apps issue** is exercised under the rules (RTDB rules are not filters; a query
  must be allowed as a whole).
- **Independent security review:** every PR touching rules, authentication, sharing, or public
  data gets a review by the security-reviewer subagent before it is opened.

## Consequences

- **M1 rules:** written together with the data model v2, and the negative-test suite is part of
  M1's definition of done.
- **Public pages and the public live demo** are designed around projections, not around the
  private records.
- **Every feature spec** states its rules impact and its tests.

## Alternatives considered

- **Client-side checks only (hiding data in the UI):** rejected. Anyone can read what the rules
  allow, whatever the UI shows.
- **Roles stored in a user document checked by the client:** rejected; such a field is writable by
  its owner.
