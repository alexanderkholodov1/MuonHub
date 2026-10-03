# MunHub Lab v6.0 — Platform Services and Integrations

> Depends on: `00-MASTER-PLAN.md`, `01-ARCHITECTURE.md`, `18-...`. Addresses two questions:
> (1) **maximizing Firebase** (self-sufficiency: running as if Firebase were the ceiling, without
> depending on Red Clara), and (2) **which external integrations make sense?** (Notion, n8n,
> Slack, etc.) so that the project is an exemplary **calling card** in research, design,
> full-stack development, and server management.

---

## 0. Guiding principle — "Firebase-complete by default" (D37, proposed)

Design the product to run **complete and indefinitely on the free Firebase tier (Spark)**.
Red Clara / Supabase = **optional upgrade, never a requirement**. This:
- validates the **edge-processing architecture** (the Tauri agent does the heavy lifting →
  offloads/bypasses the server),
- relies on Spark **blocking rather than billing** (billing-proof, D18),
- and the **agnostic layer** (`data-provider` + an `AuthProvider`/`StorageProvider`) allows
  migrating to Supabase without rewriting the app. **Every Firebase service is used behind our
  interfaces**, not directly from the app (guardrail #6).

---

## 1. Firebase maximized (verified, June 2026)

### Use NOW — free and billing-proof
| Service | Purpose in MunHub | Note |
|---|---|---|
| **Authentication** | MunHub account (email/pass + Google), verification, reset; **custom claims = roles** (admin/user/guest) with no extra DB reads | Replaces the hand-rolled v5 auth. Behind an `AuthProvider` (Supabase Auth maps 1:1 in Phase B). |
| **Realtime Database** | Streaming + `latest` (already in use, munhub-1) | Keep for real-time. |
| **Cloud Storage** | CSV/ZIP backups, institution logos, avatars, detector firmware | 5 GB on Spark; behind `StorageProvider`. |
| **Hosting** | Phase A (already in use) + PR previews | Static export (D18). |
| **Cloud Messaging (FCM)** | Web push for the notification center (Forbush detected, detector down) | Free; feeds `notifications` (doc 12). |
| **App Check** | Anti-abuse: ensures requests originate from our app | Security hardening, free. |
| **Remote Config** | Implement `feature_flags` (doc 15) without redeploy | Free. |
| **Performance Monitoring + Analytics** | Web observability (web vitals, usage) — "exemplary" credibility | Free. |

### Use with care — Functions (2M invocations/month free on Spark)
**Cloud Functions** now have **2M invocations/month on Spark**; if exceeded, they **shut off (no
charge)**. Used for tasks that must NOT live on the client:
- **Scheduled cold backups** → Cloudflare R2 (tier 3, D10/D16).
- **External API fetching** (NMDB/NOAA/DONKI/Dst-Kp, doc 07) with idempotent cache.
- **Transactional email** (verification, tickets, alerts) and **aggregations**.

> ⚠️ Verify on the first deploy whether Firebase requires Blaze to *deploy* Functions (historically
> they used Cloud Build). If required: Blaze **with a strict budget cap** + alerts. Plan B without
> Functions: the **Tauri agent** handles backups/fetching at the edge (already the core philosophy).

### Optional for UX (NOT for science) — Firebase AI Logic / Gemini
Free Gemini tier usable on Spark **without a credit card**. Permitted ONLY for experience features:
**help assistant, semantic doc search, natural-language queries** ("show me the March Forbush").
🔒 **Prohibited for the scientific pipeline** (D12: own model, reproducible, no external
dependency). If used, current model: `gemini-3.1-flash-lite` (the 2.0 Flash was retired
1-Jun-2026).

### Avoid (for now)
- **App Hosting** (managed SSR) → billing risk, avoided in D18.
- **Firestore** → sticking with RTDB unless rich queries are needed (listing public stations with
  filters). If that need arises, evaluate Firestore for metadata + RTDB for streaming.

---

## 2. External integrations — honest assessment

**Philosophy:** an impressive calling card stands out through **coherence and execution quality**,
not a *kitchen-sink* of integrations. Each integration must justify its maintenance cost.

| Tool | Makes sense? | Verdict |
|---|---|---|
| **Notion** (docs) | No for project docs | **No.** Docs-as-code (Markdown in the repo, versioned with the code) is more professional and is the **single source of truth**; Notion fragments it. For a public site, a **docs site** (below) is better. Notion for personal notes is fine, but not as a project integration. |
| **n8n** (no-code automation) | Later | Useful for **ops** without code (alerts, external API ETL, orchestrating backups) and is self-hostable (fits Red Clara). However, for a **scientific/calling-card project**, the core pipeline must be **versioned/testable code** (agent + Functions), not no-code flows. Optional in Phase B. |
| **Slack** | Low | The team is small. Real value only as an **alert sink** (webhook) or **community** channel if the project grows (where **Discord** is more standard for open source). Science: in-app + email + FCM already covers it. Dev: GitHub already notifies. Not now. |

### Recommended additions (what actually elevates the calling card)
| Component | Why (which dimension it showcases) | Cost |
|---|---|---|
| **Docs site** (Nextra/Docusaurus/Mintlify) from repo Markdown | Research + communication; looks open-source-grade | Free |
| **Storybook** (+ optional Chromatic) for `packages/ui` | **Design/front-end**: live design system catalog = portfolio gold | Free |
| **Sentry** (or Firebase Crashlytics/Perf) | **Full-stack/ops**: production-grade error monitoring | Free tier |
| **GitHub polish**: Discussions, **CodeQL** (security scan), **Dependabot**, semantic-release, README with badges, board | The repo **itself** as a calling card; security and engineering | Free |
| **Playwright** E2E in CI | Engineering rigor (covers MVP E2E, doc 18 §6) | Free |
| **Zenodo + DOI + CITATION.cff** (doc 17) | **Research**: academic citability | Free |
| **Status/uptime page** (optional) | **Server management**: operational professionalism | Free |
| **PostHog** (self-hosted, optional) | Product analytics with an autonomy ethos | Free/self-host |

> Summary: **skip Notion**; n8n/Slack/Discord = ops/community **for later**; invest in
> **docs-site + Storybook + monitoring + security + DOI + E2E** → that is what signals "exemplary
> end-to-end".

---

## 3. Landing concept captured (for the design session + Claude Design)

The target aesthetic for the landing is inspired by the **Antigravity** landing: a **particle
field reactive to the cursor** that "disturbs the space" around it. Adapted to the **Observatory**
theme:
- A field of **stars + faint cosmic-ray traces**; the cursor acts as a **mass that curves/attracts
  nearby particles** — a conceptually perfect nod: **gravitational lensing** and "Antigravity"
  ↔ cosmic rays. Alternative: the cursor **clears a bubble** in the field.
- Candidate implementation: `react-three-fiber` (WebGL) or 2D canvas; respect `prefers-reduced-motion`
  and mobile performance. Landing only (the app itself stays calm, doc DESIGN-LANGUAGE §7).
- **Status: parking-lot.** To be developed in the **next design session with Claude Design**.
  See `docs/design/LANDING-CONCEPT.md`.

---

## 4. Proposed decisions (pending confirmation)
- **D37 — Firebase-complete by default:** the product runs fully on free Firebase; Red Clara/Supabase
  = optional upgrade. All services behind our interfaces (Auth/Storage/Data).
- **D38 — Integration philosophy:** docs-as-code + docs site; **no Notion**; n8n/Slack/Discord
  deferred to ops/community; invest in Storybook + monitoring + CodeQL + Playwright + DOI.
- **D39 — Firebase Auth (Phase A):** auth + roles via **custom claims**, behind `AuthProvider`.

> Once confirmed, these will be registered in `00-MASTER-PLAN.md` and issues opened for the
> individual components (docs-site, Storybook, Sentry, CodeQL, Auth spec).
