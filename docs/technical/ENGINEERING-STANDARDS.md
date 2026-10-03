# MuonHub — Engineering standards & practices

> The standards MuonHub holds itself to, and the honest verdict on industry practices we evaluated.
> The rule of thumb: **a practice earns its place only if it adds real value or robustness** —
> never cargo-cult, never gold-plating.

## Verdict on evaluated practices

| Practice | Verdict | How we apply it |
|---|---|---|
| **Clean / Hexagonal Architecture** | ✅ **Core** | Dependencies point *inward*. `packages/shared` + `packages/physics` are the pure domain (no I/O); `data-provider` is the interface-adapter layer; `apps`/`services` are outer "details". Frameworks (Firebase, Next.js, Tauri) are swappable plugins, not the center. |
| **SOLID** | ✅ **Core** | Especially **DIP** — the app depends on the `DataProvider` abstraction, never on a vendor SDK (our keystone). **SRP** = one job per package; **OCP/LSP** = new providers without touching callers; **ISP** = focused interfaces, no god-objects. |
| **Future-proof** | ✅ with **YAGNI** | Design for change at the boundaries (provider-agnostic, versioned schema/API, i18n from day one). But we **do not** build for imagined futures — abstractions appear when a second case proves them, not before. |
| **SDD — Spec-Driven Development** | ✅ **Our method** | No code without a spec in `specs/`; human gate before building. See `AGENTS.md`. |
| **TDD — Test-Driven Development** | ✅ **Pragmatic** | **Test-first where correctness is the product**: `packages/physics` (write the numeric test from the scientific foundation, then implement) and `packages/shared` schemas. **Test-after / E2E** for UI and integration. Dogma is not the goal; trustworthy science is. |
| **Design patterns** | ✅ **Judiciously** | As vocabulary, not trophies. Already present: **Repository/Facade** (`data-provider`), **Adapter** (provider + serial-format + migration adapters), **Strategy** (correction steps, chart types), **Observer** (realtime subscriptions), **Factory** (provider creation). |
| **C4 documentation** | ✅ **Adopt** | Architecture documented as C4 levels: **Context** and **Container** now (Mermaid, renders on GitHub), **Component** as packages grow. See `ARCHITECTURE.md`. |
| **MoE — Mixture of Experts** | ⚠️ **Not literally** | As a deep-learning architecture it is overkill for our classical ML (no need, no GPU). But its *spirit* — route work to specialized experts — already lives in two places: the **multi-provider agent fleet** (the AFLEK kit) and the **champion–challenger ensemble** planned for the ML layer (`planning/06`). We adopt the idea, not the neural-net machinery. |

## Standards we also commit to (maestro's additions)

- **DDD-lite — ubiquitous language.** One shared vocabulary across code, docs, and UI:
  *Institution → Station → Detector → Session* (D21). The glossary is canonical; no synonyms drift in.
- **ADRs — Architecture Decision Records.** Significant choices are captured (`docs/technical/adr/`)
  with context, decision, and consequences — alongside the high-level decision log in `planning/`.
- **Conventional Commits + Semantic Versioning.** Readable history and honest version numbers
  (currently `6.0.0-alpha.1`).
- **Keep a Changelog.** Every notable change is logged in `CHANGELOG.md` (enforced by guardrail).
- **12-Factor principles** for services: config via environment, stateless processes, logs as
  streams — so Phase B deploys cleanly to any server.
- **Defense-in-depth quality** (AFLEK doctrine 7): CI + secret scan + coverage (hard gate from S06)
  + cross-provider review + protected `main`.
- **Accessibility (WCAG AA)** and the **anti-"AI-look" doctrine** baked into the design system.
- **Observability** (structured logs, metrics, health) designed into services from the start.
- **KISS / YAGNI** as the explicit counterweight to every "best practice" above: the simplest
  thing that is correct and clear wins.

## The throughline
Clean Architecture gives us the *shape*, SOLID gives us the *discipline*, SDD/TDD give us the
*method*, C4/ADR/Changelog give us the *memory*, and YAGNI/KISS keep us *honest*. Together they are
why MuonHub can run on a free tier today and a self-hosted cluster tomorrow without a rewrite.
