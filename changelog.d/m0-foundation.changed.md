- The product is named **MuonHub** everywhere; packages use the `@muonhub/*` scope.
- Lockstep versioning `6.0.0-alpha.<milestone>.<iteration>.<fix>` and one pull request per
  milestone (ADR-008).
- Documentation reorganized into product, decisions, architecture, science, operations, process,
  and archive; the June 2026 planning corpus and first-attempt documents are archived intact.
- `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, the user manual, the design language,
  the PR template, and `CODEOWNERS` describe the v6 rebuild, the approved terminology, and the
  maintainer's data-integrity rule.
- Firebase tooling targets the `muonhub` project (`infra/firebase/.firebaserc`); `.env.example`
  lists only the variables the code reads.
- First-attempt specs 0001–0077 are marked superseded; the changelog fragments of the first attempt
  are compiled into a historical section of `CHANGELOG.md`.
