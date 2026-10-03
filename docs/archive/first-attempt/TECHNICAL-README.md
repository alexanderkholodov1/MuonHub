# MuonHub — Technical documentation

Documentation for contributors and integrators. (End-user concepts live in
[`../user-manual/`](../user-manual/); the internal master plan and decision log live in
[`../../planning/`](../../planning/).)

> **Status:** pre-alpha. These documents describe the **target v6 design** and the parts already
> built. Where something is planned but not yet implemented, it is marked accordingly.

## Contents
| Document | What it covers |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System components (with a C4 diagram), the provider-agnostic data layer, data flow, deployment phases, quality gates |
| [`DATA-MODEL.md`](DATA-MODEL.md) | Entities (institution → station → detector → session), the canonical record schema, corrections pipeline |
| [`SERIAL-FORMATS.md`](SERIAL-FORMATS.md) | The four detector output formats the agent auto-detects, and the minute-aggregation mapping |
| [`ENGINEERING-STANDARDS.md`](ENGINEERING-STANDARDS.md) | The practices we hold to (Clean Architecture, SOLID, pragmatic TDD, C4) and verdicts on evaluated approaches |
| [`adr/`](adr/) | Architecture Decision Records |

## Related
- Scientific basis: [`../research/THEORETICAL-FOUNDATION.md`](../research/THEORETICAL-FOUNDATION.md)
- Visual contract: [`../design/DESIGN-LANGUAGE.md`](../design/DESIGN-LANGUAGE.md)
- How the project is built (specs, agent fleet, PR/CI flow): [`../../AGENTS.md`](../../AGENTS.md)
- Live progress: [`../STATUS.md`](../STATUS.md)
