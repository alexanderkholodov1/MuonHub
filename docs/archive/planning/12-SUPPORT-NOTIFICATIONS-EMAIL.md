# MunHub Lab v6.0 — Support, Notifications, and Email

> Depends on: `10-OPERATIONS-AND-GOVERNANCE`. Makes the system **self-sufficient**: users open
> tickets (rather than emailing the admin directly), and the system sends alerts automatically.
> Phase F5 (with notification pieces landing earlier). Principle D23: informative and complete.

---

## 1. Support ticket system

- **Who:** any authenticated user (and optionally guests, with email + captcha).
- **Categories:** Question · Problem/Bug · Suggestion · Feedback/Appreciation.
- **Automatically attached metadata** (with consent): user, role, institution,
  station/detector in context, agent version, browser/OS, recent client errors, timestamp,
  language. Reduces back-and-forth.
- **Lifecycle:** open → in progress → awaiting response → resolved → closed. Message thread
  user ↔ admin, with attachments (screenshots).
- **Admin inbox** inside the console (no manual email): filter by status, category,
  institution; assign, respond, close.
- **Linked public FAQ** to deflect common questions (reduces ticket volume).
- **Suggestion voting** (optional, later phase): other users can upvote an idea.

## 2. Notification center (in-app + email)

A single center with per-channel (in-app / email) and per-type preferences:

| Event | Recipient | Suggested channel |
|-------|-----------|-------------------|
| Your ticket updated | user (and admin) | in-app + **email** |
| Detector down / no data | owner/editors | in-app + email |
| Data gap detected | owner | in-app |
| Anomaly / Forbush detected | owner + (network if applicable) | in-app + email |
| Incomplete metadata reminder | owner | in-app (non-intrusive) |
| Station sharing invitation | invitee | in-app + email |
| System announcement (maintenance) | all | in-app (+ email if critical) |
| Role/permission change | affected user | in-app + email |

- **Per-user preferences:** mute types, choose channel, frequency (immediate / daily digest).
- Internationalized (es / en / pt-BR).

## 3. Transactional email (infrastructure)

Required for tickets and notifications. Requirement: **free tier and billing-proof**.
- Options: **Brevo** (~300/day free), **Resend** (~3,000/month free), or the Firebase
  **"Trigger Email"** extension with a free SMTP provider. (Minor technical decision; choose at implementation time.)
- Versioned, multi-language templates with a verified sender (SPF/DKIM for the domain).
- **No secrets in the repo:** provider API key via environment variable.
- Handle bounces and unsubscribes for non-essential emails (comply with anti-spam best practices).

## 4. Data model (summary; detail in `02`)
- `support_tickets(id, user_uid, category, status, subject, context jsonb, created_at, updated_at)`
- `ticket_messages(id, ticket_id, author_uid, body, attachments, created_at)`
- `notifications(id, user_uid, type, payload jsonb, read_at, created_at)`
- `notification_prefs(user_uid, type, channel, frequency)`

## 5. Phase / priority
- Basic in-app notifications: delivered with the dashboard (F2).
- Full email + tickets: F5 (admin console).
