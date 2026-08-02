# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- OpenCode v2 plugin API: `Plugin.define` with catalog and tool transforms
- Plugin-owned endpoint configuration via `options.endpoints` (`id`, `baseURL`, `apiKey`, `headers`, `include`/`exclude`)
- Live catalog refresh via `catalog.reload()` — the `refresh-local-models` tool updates models without restarting OpenCode
- Zed editor settings (oxfmt formatting, oxlint linting, TS type checking)
- CI quality gate on push and pull requests, shared with the publish workflow
- Dependabot for npm and GitHub Actions dependencies

### Changed

- Configuration moved from v1 `provider` entries to the v2 `plugins` array
- `@opencode-ai/plugin` pinned to the `next` channel (v2 API)
- v2 releases publish under the `next` npm dist-tag while the OpenCode v2 plugin API is in beta; `latest` keeps tracking the v1 plugin
- Typecheck now covers `src` and `tests` through the root `tsconfig.json`

### Fixed

- `refresh-local-models` now clears the on-disk OpenRouter cache and replays the catalog immediately instead of serving a stale 24h cache
- OpenRouter requests time out after 10s instead of hanging the config hook
- Test caches are isolated to temp directories instead of the real user cache
