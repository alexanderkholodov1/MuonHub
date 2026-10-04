- Node.js 24 LTS for the whole repository (`.nvmrc`, `engines`, CI) and pnpm 11.28.
- Shared tool versions come from a pnpm catalog: TypeScript 6.0 (TypeScript 7 waits for
  typescript-eslint support), vitest 5, Node 24 types.
- ESLint 10 with the recommended JavaScript and TypeScript rules and an ASCII-only identifier rule
  for the packages and the agent; the first-attempt web app keeps its own Next.js lint setup until
  it is rebuilt.
- Prettier formatting is checked in CI for code (Markdown is formatted by hand).
- Turborepo hashes every file of a package, caches the static export, and is configured not to
  write into `AGENTS.md`; `clean` also removes TypeScript build-info files.
