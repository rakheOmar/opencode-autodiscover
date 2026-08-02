# Contributing

Thanks for considering contributing to opencode-autodiscover. This plugin auto-discovers models from local OpenAI-compatible endpoints for OpenCode.

## Development setup

```bash
npm install
npm test
```

Run the full quality gate before opening a PR — CI runs the same commands:

```bash
npm run check       # formatting + lint (ultracite / oxfmt / oxlint)
npm run typecheck   # TypeScript, src and tests
npm run build       # emit dist/
```

## Conventions

- **Test-first (TDD)**: write a failing test, then implement. Tests live in `tests/` and cover observable behavior, not implementation details.
- **TypeScript strict mode**: no `any`; keep functions small and focused.
- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:` prefixes on commit messages.
- **Branch names**: kebab-case.
- Runtime dependencies keep the `"latest"` specifier (`models-dev-db`) or the channel the OpenCode v2 docs mandate (`@opencode-ai/plugin: "next"`).

## Pull requests

- Open an issue first for non-trivial changes.
- Keep PRs focused: one logical change per PR.
- Update `README.md` and the `[Unreleased]` section of `.github/CHANGELOG.md` for user-visible changes.
- The CI quality gate (lint, test, build, typecheck) must pass.

## Project layout

- `src/index.ts` — plugin entry (config hook, catalog/tool transforms)
- `src/fetcher.ts` — fetches models from local endpoints
- `src/openrouter.ts` / `src/modelsdev.ts` — metadata enrichment with caching
- `src/filter.ts` / `src/normalize.ts` / `src/security.ts` — filtering and input handling
