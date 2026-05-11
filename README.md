# opencode-autodiscover

Auto-discover models from local OpenAI-compatible API endpoints for [OpenCode](https://opencode.ai).

## Features

- Auto-discovers models from local endpoints (Ollama, LM Studio, LLM proxies)
- Fetches metadata from Models.dev and OpenRouter (context window, capabilities, cost)
- Caches metadata locally (24h TTL)
- Supports multiple endpoints
- API key authentication via config or environment variables

## Installation

```bash
opencode plugin opencode-autodiscover
```

Or install globally:

```bash
opencode plugin opencode-autodiscover -g
```

## Configuration

Add provider(s) to your `opencode.json`:

```json
{
  "provider": {
    "local-ollama": {
      "name": "Ollama",
      "options": {
        "baseURL": "http://localhost:11434/v1"
      }
    },
    "local-lmstudio": {
      "name": "LM Studio",
      "options": {
        "baseURL": "http://localhost:1234/v1"
      }
    }
  }
}
```

### With API Key

```json
{
  "provider": {
    "local-proxy": {
      "name": "My Proxy",
      "options": {
        "baseURL": "http://localhost:8080/v1",
        "apiKey": "sk-your-key"
      }
    }
  }
}
```

### Environment Variables

API keys can be set via environment variables:

```bash
export OPENCODE_LOCAL_MY_PROXY_API_KEY=sk-your-key
```

### Model Overrides

Override metadata for specific models:

```json
{
  "provider": {
    "local-ollama": {
      "options": {
        "baseURL": "http://localhost:11434/v1",
        "modelOverrides": {
          "my-custom-model": {
            "contextWindow": 128000,
            "maxOutput": 8192
          }
        }
      }
    }
  }
}
```

## Usage

Models are auto-discovered at startup and appear in `/models` natively.

To refresh models, use the `refresh-local-models` tool in OpenCode, then restart.

### CLI Options

```
opencode plugin opencode-autodiscover         # Install to project config
opencode plugin opencode-autodiscover -g      # Install to global config
opencode plugin opencode-autodiscover -f      # Force update existing plugin
opencode plugin opencode-autodiscover --pure  # Run without external plugins
```

## How It Works

1. On startup, the plugin reads provider configs with `baseURL` options
2. Fetches available models from each endpoint (`/v1/models`)
3. Looks up metadata from Models.dev and OpenRouter (context window, cost, capabilities)
4. Injects discovered models into the provider config
5. Models appear in OpenCode's `/models` UI

## Caching

Metadata is cached locally for 24 hours:

- **Location:** `~/.cache/opencode-autodiscover/`
- **Files:**
  - `openrouter.json` — OpenRouter metadata cache
  - `modelsdev.json` — Models.dev metadata cache

Use the `refresh-local-models` tool to clear cache and re-fetch.

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
