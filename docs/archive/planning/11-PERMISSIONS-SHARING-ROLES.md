# MunHub Lab v6.0 — Permissions, Sharing, and Roles

> Depends on: `02-DATA-MODEL`, `05-REDUNDANCY-AND-SECURITY`. Decisions D8, D24, D25.
> Defines the complete authorization model for the platform. Applied by the security agent.

---

## 1. Two orthogonal layers

1. **System role** (who you are across the whole platform):
   `admin` (global) · `institution_admin` (their institution) · `user` · `guest` (unauthenticated / public read-only).
2. **Per-station permission** (what you can do on *that* station):
   `owner` · `editor` · `viewer`.

Both layers combine: e.g. a `user` can be `owner` of their own station and `viewer` of another shared station.

---

## 2. Station visibility (D24)

| Level | Who can read it |
|-------|----------------|
| **Public** | Anyone (including guests); shown on the landing map |
| **Institutional** | Members of the owning institution (only if the station belongs to an institution) |
| **Private** | Owner + users/institutions with explicit permission |

- Selection is **required at creation, with no default** (D22). Changeable afterward by owner/admin.
- Optional **embargo**: private until a specified date → then public (to allow paper publication first).

---

## 3. What each per-station permission allows

| Action | viewer | editor | owner | institution_admin* | admin |
|--------|:--:|:--:|:--:|:--:|:--:|
| View data and metadata | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Write / ingest data** (agent) | — | ✓ | ✓ | ✓ | ✓ |
| Edit metadata / calibration | — | ✓ | ✓ | ✓ | ✓ |
| Manage detectors (devices) | — | ✓ | ✓ | ✓ | ✓ |
| Share / change visibility | — | — | ✓ | ✓ | ✓ |
| Delete station | — | — | ✓ (confirmation required) | ✓ | ✓ |

\* `institution_admin` applies only to stations belonging to their institution.

> **Resolved use case (D-edit):** the `editor` **can write data** to the station even from a
> different machine/agent (e.g. the owner does not have the hardware on hand and a colleague
> uploads the data). This intersects with the device-token warning: if the physical device
> differs from the registered one, the platform notifies for consistency but still allows the write.

---

## 4. Membership and institutions

- A user may belong to **one institution** (or none → independent).
- `institution_admin` manages members and stations of their institution only (not others).
- **Configurable institutional default:** an institution can set its stations to be created with
  `institutional` visibility by default (suggested, not enforced).
- Joining an institution: by **invitation from the institution_admin** or by request + approval
  (prevents any user from self-assigning to a university).

---

## 5. User identity and sharing (D25)

Each account stores: **email** (unique), **username** (unique), **display name**, country,
language, institution (optional), role.

**Station sharing flow:**
- Search by **exact email** (invite mode) or by **username**; the UI shows
  **name + institution** to confirm the correct person.
- Alternative: select from the **member list of your institution**.
- Assign permission (`viewer`/`editor`).
- **Privacy:** the platform does not reveal whether an email exists (the invite is always sent);
  free username search is only available if the user opts in via their settings (opt-in directory).

---

## 6. Technical rule mapping

- **Phase A (Firebase rules):** validate visibility + grants (`station_shares`) +
  institutional membership + system role. Deny-by-default.
- **Phase B (Postgres RLS):** one policy per table/action equivalently; the `editor` role
  enables `INSERT` on `minute_records`/`realtime_records` for that station.
- **Mandatory tests:** both **allowed and denied** (negative) cases for every
  role × permission × visibility combination.

---

## 7. Open product questions
- Should the username-searchable user directory be opt-in by default? (Proposal: yes, opt-in.)
- Can a station be shared with an **entire institution**, or only with individual users? (Proposal: both.)
