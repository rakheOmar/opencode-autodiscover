# opencode-autodiscover

Auto-discover models from local OpenAI-compatible API endpoints for [OpenCode](https://opencode.ai).

## Features

- Auto-discovers models from local endpoints (Ollama, LM Studio, LLM proxies)
- Fetches metadata from Models.dev and OpenRouter (context window, capabilities, cost)
- Caches metadata locally (24h TTL)
- Supports multiple endpoints
- API key authentication via config or environment variables
- Model filtering with include/exclude patterns

## Installation

```bash
opencode plugin opencode-autodiscover
```

Or install globally:

```bash
opencode plugin opencode-autodiscover -g
```

> The v2 plugin (OpenCode v2 / beta plugin API) publishes under the `next` npm tag: `opencode plugin opencode-autodiscover@next`. The `latest` tag still tracks the v1 plugin for stable OpenCode.

### CLI Options

```
opencode plugin opencode-autodiscover         # Install to project config
opencode plugin opencode-autodiscover -g      # Install to global config
opencode plugin opencode-autodiscover -f      # Force update existing plugin
opencode plugin opencode-autodiscover --pure  # Run without external plugins
```

## How It Works

1. On startup, the plugin reads `options.endpoints` from its plugin config
2. Fetches available models from each endpoint (`/v1/models`)
3. Looks up metadata from Models.dev and OpenRouter (context window, cost, capabilities)
4. Registers the discovered providers and models in the OpenCode catalog via a catalog transform
5. Models appear in the `/models` UI natively; the `refresh-local-models` tool replays the transform live

## Caching

Metadata lookups are cached to keep startup fast:

- **OpenRouter catalog** — written to `openrouter.json` under `~/.cache/opencode-autodiscover/` (24h TTL). Override the location with the `OPENCODE_AUTODISCOVER_CACHE_DIR` environment variable.
- **Models.dev** — loaded in memory per process from the bundled `models-dev-db` package; rebuilt on each startup.

Use the `refresh-local-models` tool to clear both caches and re-fetch — the catalog is updated immediately, no restart needed.

## Configuration

Add the plugin to the `plugins` array in your `opencode.jsonc`, listing each local endpoint under `options.endpoints`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-autodiscover",
      "options": {
        "endpoints": [
          {
            "id": "local-ollama",
            "name": "Ollama",
            "baseURL": "http://localhost:11434/v1",
          },
          {
            "id": "local-lmstudio",
            "name": "LM Studio",
            "baseURL": "http://localhost:1234/v1",
          },
        ],
      },
    },
  ],
}
```

Each endpoint supports:

- `id` (required) — provider id used in the catalog (e.g. `local-ollama`)
- `baseURL` (required) — base URL of the OpenAI-compatible API
- `name` — display name for the provider
- `apiKey` — API key sent to the endpoint
- `headers` — extra HTTP headers sent with requests
- `include` / `exclude` — model filtering patterns (see below)

### Environment Variables

API keys can be set via environment variables instead of `apiKey`:

```bash
export OPENCODE_LOCAL_MY_PROXY_API_KEY=sk-your-key
```

The variable name is derived from the endpoint id: `OPENCODE_LOCAL_` + the id uppercased with `-` replaced by `_`.

### Model Filtering

Control which models are discovered using `include` and `exclude` glob patterns on an endpoint:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-autodiscover",
      "options": {
        "endpoints": [
          {
            "id": "local-ollama",
            "baseURL": "http://localhost:11434/v1",
            "include": ["qwen/*"],
            "exclude": ["*embedding*", "*test*"],
          },
        ],
      },
    },
  ],
}
```

- `include` — if set, only models matching at least one pattern are discovered
- `exclude` — models matching any pattern are skipped (applied after `include`)
- `*` matches anything (including `/`)
- Matching is case-insensitive
- Special characters (`.`, `[`, `]`, etc.) are treated as literals

## Usage

Models are auto-discovered at startup and appear in `/models` natively.

### Refreshing Models

- **Terminal Slash Command**: Run `/refresh-models` (or `/models:refresh`, `/autodiscover:refresh`) in the OpenCode TUI prompt.
- **Command Palette**: Select **Refresh Local Models** from the command palette.
- **Agent Tool**: Use the `refresh-local-models` tool during agent sessions.

When refreshed, the plugin synchronizes local endpoints, updates the catalog, and displays a toast notification in the terminal. A restart is not needed.

### CLI / Remote Configuration

When using a remote OpenCode server, configure the package in `cli.json` to keep TUI commands active locally:

```json
{
  "plugins": ["opencode-autodiscover"]
}
```

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
