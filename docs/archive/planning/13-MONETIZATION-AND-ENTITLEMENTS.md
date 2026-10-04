# MunHub Lab v6.0 — Monetization and Entitlements (design / hooks only)

> Decision D26: **the core is always free.** v6.0 does NOT implement billing; only the
> **technical hooks** (entitlements + metering) are put in place to enable tiers/quotas/donations
> in the future **without a rewrite**. The business/legal decision belongs to the maintainer and
> the university.

---

## 1. Principle

MunHub is born from an **open-science mission** (Erasmus+/EU): acquiring, storing,
visualizing, analyzing, and joining the network must be **free for everyone**, with no freemium
gate that disrupts anyone's research. Monetization, if it ever arrives, **only covers the cost
of expensive extras**, and never blocks the core.

## 2. What could have a cost (future, optional, high marginal cost)

- **On-demand intensive ML compute** / custom model training.
- **API quota** above the free tier (high-volume programmatic use).
- **Bulk exports** / extended retention of high-resolution realtime data.
- **Private instances / white-label** for an institution (their own deployment + support).
- **Institutional support/SLA** (B2B; does not affect individual users).

## 3. Preferred sustainability model (without charging users)
- **Donations** ("support the project" button).
- **Grants** and research funding.
- **Institutional agreements/sponsorships**.

## 4. Technical hooks to build NOW (no billing UI)

- **Plan/entitlements model:** `plans(id, name, limits jsonb)` and
  `entitlements(subject_type[user|institution], subject_id, plan_id, valid_until)`.
  By default **everyone is on the "Open" plan (free) with no obstructive limits**.
- **Metering (usage measurement):** record usage of expensive resources (ML jobs, API calls,
  exported bytes) in `usage_events`. Today it only observes/reports; tomorrow it can bill.
- **Feature flags** tied to entitlements (an advanced feature is enabled per plan), all
  enabled in "Open" for now.
- **Zero payment gateway** in v6.0.

> This way, if billing is ever decided, a payment gateway is added and plan limits are adjusted,
> without touching the rest of the system.

## 5. Legal/payments reality (for when a decision is made — outside v6 technical scope)

- Requires a **legal entity** (USFQ, a foundation, or personal registration) and compliance
  with billing/tax law in Ecuador + internationally.
- Payment gateways: verify Ecuador payout availability (Stripe historically limited;
  PayPal viable; or billing via the university). Local methods (cards, transfers).
- Comply with data-protection laws and terms of service (see `10-Governance`).
- **Recommendation:** do not rush; build traction and institutional backing first.

## 6. Phase
- Entitlements/metering schema: F1 (part of the data model), no billing UI.
- Payment gateway/paid plans: **outside v6.0** (future module).
