# Changelog fragments

To let many pull requests run in parallel without colliding on a single `CHANGELOG.md`, **each PR
drops a small fragment file here** instead of editing `CHANGELOG.md` directly. Fragments are
compiled into `CHANGELOG.md` under the next version at release time, then removed.

## Format
One file per change, named:

```
<slug>.<category>.md
```

- **`<slug>`** — short, unique, kebab-case (use the branch/spec slug, e.g. `physics-corrections`).
  Unique filenames mean two PRs never touch the same file → no merge conflicts.
- **`<category>`** — one of: `added`, `changed`, `fixed`, `removed`, `deprecated`, `security`
  (the [Keep a Changelog](https://keepachangelog.com/) categories).

The file contains one or more bullet lines describing **what the change delivers**, written to the
[`CONTRIBUTING.md`](../CONTRIBUTING.md) PR-description standard (neutral, product-facing — not a
narrative of how it was made).

## Example
`changelog.d/physics-corrections.added.md`:
```md
- Dead-time and local-barometric corrections in `@muonhub/physics`, with numeric tests against the
  scientific foundation values.
```

## Release
At release, the maintainer (or orchestrator) collates all fragments into a new `CHANGELOG.md`
version section and deletes them. `.gitkeep` keeps this directory present when empty.
