# MunHub Lab v6.0 — Admin Console

> Depends on: `05`, `11`, `12`. Expands EPIC-8. Guiding principle: **everything is managed
> from the platform, without touching code or the server** (migrate data, edit users/stations,
> resolve errors). Self-sufficient ecosystem (D23). Dedicated page, `admin` role only.

---

## 1. Global admin capabilities

**Users**
- Create, edit, **disable**, and delete accounts (with destructive confirmation).
- Assign/remove roles, including **promoting new admins** and `institution_admin`.
- **Create accounts and institutions on behalf of others** (for users with low digital literacy).
  Password reset / verification-email resend.

**Stations and detectors**
- Create/edit/delete stations and detectors; **assign/revoke permissions** (owner/editor/viewer).
- Change visibility, reassign owner, move a station between institutions.

**Data / infrastructure (without touching the server)**
- Usage/storage statistics; **provider migration** (Firebase ↔ Supabase);
  **import external DB from file**; cold backups and **restoration**; integrity verification.
  (Already in EPIC-8/EPIC-9, accessible here.)

**Support and communications**
- **Ticket inbox** (respond, assign, close) — see `12`.
- **Announcements/broadcast** (maintenance notices / release notes).

**System**
- **Feature flags / global settings** (e.g. enable/disable ML training, open registration,
  maintenance mode).
- **Audit log** (see §3).
- **View-as-user** (support mode to diagnose issues) — recorded in the audit log.
- Entitlements/metering (see `13`) — observation only, no billing.

## 2. Destructive confirmations (GitHub style)
Every irreversible action (delete station/user/institution, migrate/overwrite data)
requires **typing the exact resource name** plus a clear warning of consequences. Where
possible, **soft-delete + prior backup** before physical deletion.

## 3. Audit log (security and trust)
- Records: actor, action, resource, before/after (summary), timestamp, IP/session.
- Immutable/append-only; queryable and exportable by admin.
- Covers sensitive actions: role/permission changes, deletions, migrations, view-as-user,
  visibility changes, calibration edits.

## 4. Onboarding wizard (for all users, including non-technical)
- Step-by-step assistant: create/join institution → create station (with contextual help)
  → register detector → connect the agent. With clear text and links to documentation.
- Admin/`institution_admin` can run it **on behalf of** a user who needs assistance.

## 5. Backlog (see `04`, expanded EPIC-8)
- Dedicated admin page · user/role/institution management · station/detector management
  · audit log · announcements · feature flags · view-as-user · ticket inbox · onboarding wizard.
