# Agents Configuration

This file configures how AI agents interact with this project.

## Project Overview

**opencode-autodiscover** is an OpenCode v2 plugin that auto-discovers models from local OpenAI-compatible API endpoints (Ollama, LM Studio, LLM proxies). It registers providers/models through catalog transforms and enriches them with metadata from OpenRouter and Models.dev.

## Commands

- **Test**: `npm test` (Vitest) · Watch: `npm run test:watch`
- **Quality gate**: `npm run check` (formatting + lint via ultracite/oxfmt/oxlint) · `npm run typecheck` (tsc, src and tests) · `npm run build` (emit `dist/` via `tsconfig.build.json`)
- CI runs check → test → build → typecheck on every PR and before publishing

## Architecture

- `src/index.ts` — plugin entry: `Plugin.define({ id, setup })`; parses `options.endpoints`, registers the catalog transform and the `refresh-local-models` tool, refreshes via `ctx.catalog.reload()`
- `src/fetcher.ts` — fetches `/v1/models` from a local endpoint
- `src/filter.ts` — include/exclude glob filtering of model ids
- `src/normalize.ts` — model ID normalization
- `src/security.ts` — URL validation, model id / error message sanitization
- `src/openrouter.ts` — OpenRouter metadata lookup with disk cache (24h TTL, `OPENCODE_AUTODISCOVER_CACHE_DIR` override, 10s request timeout)
- `src/modelsdev.ts` — Models.dev metadata lookup with in-memory cache
- `src/types.ts` — shared type definitions

## TypeScript setup

- `tsconfig.json` — editor/dev config: covers `src` and `tests`, `noEmit`, `types: ["node"]`; the language server associates every file with it
- `tsconfig.build.json` — build-only: emits `dist/` from `src/` (rootDir `src`, declaration enabled)

## Conventions

- TypeScript strict mode; never `any` (no `: any` / `as any`)
- TDD: write a failing test first, then implement; tests cover observable behavior in `tests/`
- Keep functions small and focused; descriptive variable names
- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`); kebab-case branch names
- Runtime dependencies keep `"latest"` (`models-dev-db`) or the channel the v2 docs mandate (`@opencode-ai/plugin: "next"`)
- User-visible changes: update `.github/CHANGELOG.md` `[Unreleased]` and `README.md`

## Enforced code rules

- Use `Promise.withResolvers()`, never `new Promise(...)`
- No redundant `clearTimeout` guards
- Top-level `import type`, never inline `import("pkg").Type`
- Static imports only; test-boundary dynamic imports need an explanatory comment
- Never `any`: prefer type guards and `unknown` narrowing

## Test seams

- Mocks: `vi.mock` with `vi.fn<(...) => ...>()` type parameters (required by the vitest lint rules); `vi.stubGlobal`/`unstubAllGlobals` for fetch
- Cache isolation: tests redirect caches to temp dirs via the `OPENCODE_AUTODISCOVER_CACHE_DIR` env var — never touch the real user cache
- `tests/plugin.test.ts` mocks the v2 context: `catalog.transform` captures the callback, `reload()` replays it, `tool.transform` applies at registration
