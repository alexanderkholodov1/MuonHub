# MuonHub — Engineering standards & practices

> The standards MuonHub holds itself to, and the verdict on industry practices we evaluated.
> Rule of thumb: **a practice earns its place only if it adds real value or robustness** — no
> cargo-culting, no gold-plating. How work is organised day to day is in
> [`WORKFLOW.md`](WORKFLOW.md); the decisions behind the architecture are in
> [`docs/decisions/`](../decisions/README.md).

## Verdict on evaluated practices

| Practice | Verdict | How we apply it |
|---|---|---|
| **Clean / Hexagonal Architecture** | ✅ **Core** | Dependencies point *inward*. `packages/shared` and `packages/physics` are the pure domain (no I/O); `packages/data-provider` is the adapter layer over Firebase; the web app and the agent daemon are outer "details". Frameworks (Firebase, Next.js, the Node runtime) are plugins, not the centre. |
| **SOLID** | ✅ **Core** | Especially **DIP**: apps depend on the `DataProvider` abstraction, never on a vendor SDK (the Firebase SDK lives only in `packages/data-provider`). **SRP** = one job per package; **OCP/LSP** = new device types and data sources without touching callers; **ISP** = focused interfaces, no god-objects. |
| **Future-proof** | ✅ with **YAGNI** | Design for change at the boundaries: provider-agnostic data access, versioned contracts, versioned device types and calibrations, i18n from day one. We do **not** build for imagined futures — an abstraction appears when a second real case proves it. |
| **SDD — Spec-Driven Development** | ✅ **Our method** | No code without a spec in `specs/` and an approved milestone plan. See [`WORKFLOW.md`](WORKFLOW.md) and the [spec template](templates/spec.md). |
| **TDD — Test-Driven Development** | ✅ **Pragmatic** | **Test-first where correctness is the product**: `packages/physics` (write the numeric test from the scientific foundation, then implement), `packages/shared` schemas, parsers (golden files from real serial captures), and security rules (negative tests). **Test-after / E2E** for UI and integration. Trustworthy science is the goal, not dogma. |
| **Design patterns** | ✅ **Judiciously** | As vocabulary, not trophies: **Repository/Facade** (`data-provider`), **Adapter** (device-type parsers, data sources), **Strategy** (recipe steps, chart types), **Observer** (live subscriptions), **Factory** (provider creation). |
| **C4 documentation** | ✅ **Adopt** | Architecture documented as C4 levels — **Context** and **Container** now (Mermaid, renders on GitHub), **Component** as packages grow. See [`docs/architecture/`](../architecture/ARCHITECTURE.md). |
| **MoE — Mixture of Experts** | ⚠️ **Not literally** | As a deep-learning architecture it is overkill (no need, no GPU). Its *spirit* — route work to specialised experts — already lives in our **parallel subagents and reviewer subagents**, and in the champion–challenger idea kept for any future ML layer ([archived design](../archive/planning/06-AI-DESIGN.md)). We adopt the idea, not the machinery. |

## Standards we also commit to

- **Ubiquitous language (DDD-lite).** One vocabulary across code, docs, and UI, defined in
  **ADR-004**: *Device* (always the physical hardware), *Device type*, *Station*, *Assembly*,
  *Stream* (where data lives — data never belongs to a "detector"), *Session*, *Calibration*,
  *Recipe*, *View*, *Agent*. No synonyms drift in.
- **Data integrity (ADR-006).** Raw data is immutable; canonical data is reproducible from raw;
  derived data records the recipe and version that produced it. Filtering and calibration are
  welcome — storing altered data as if it were pure is not.
- **Security by default (ADR-009).** Deny by default; every rule has negative tests run with real
  client identities; least privilege; no admin keys on detector machines.
- **Free-tier discipline (ADR-005).** Every feature states its cost against the Firebase Spark quotas
  (connections, downloads, storage, reads/writes, hosting transfer) and is designed to stay inside
  them.
- **ADRs — Architecture Decision Records.** Significant choices are recorded in
  [`docs/decisions/`](../decisions/README.md) with context, decision, and consequences. Decisions
  change only through a new ADR approved by the maintainer.
- **Conventional Commits + Semantic Versioning.** Readable history and honest version numbers —
  lockstep `6.0.0-alpha.<milestone>.<iteration>.<fix>` until `6.0.0` (**ADR-008**).
- **Keep a Changelog.** Every notable change adds a fragment in `changelog.d/`, compiled into
  `CHANGELOG.md` at release time.
- **12-factor habits** for the agent daemon (**ADR-007**) and scheduled jobs: configuration through
  the environment, logs as streams (stdout / journald), restartable stateless processes around a
  durable local store.
- **Defense-in-depth quality:** CI (typecheck · lint · build · test), Firebase emulator tests,
  gitleaks, the physics coverage gate, reviewer subagents (author ≠ reviewer), a protected `main`,
  and validation in real practice before a milestone's pull request opens.
- **Accessibility (WCAG AA)** and the **anti-"AI-look" doctrine** of the design system
  ([`docs/design/DESIGN-LANGUAGE.md`](../design/DESIGN-LANGUAGE.md)).
- **Observability:** structured logs, health status, and explicit states (connected / stale / no
  data / offline) designed in from the start — never a status that silently freezes.
- **KISS / YAGNI** as the explicit counterweight to everything above: the simplest thing that is
  correct and clear wins.

## The throughline

Clean Architecture gives us the *shape*, SOLID the *discipline*, SDD/TDD the *method*,
C4/ADR/Changelog the *memory*, and YAGNI/KISS keep us *honest*. Together they let MuonHub run
indefinitely on the Firebase free tier with scientific data we can trust.
