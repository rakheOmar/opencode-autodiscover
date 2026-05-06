# Agents Configuration

This file configures how AI agents interact with this project.

## Project Overview

**opencode-autodiscover** is an OpenCode plugin that auto-discovers models from local OpenAI-compatible API endpoints.

## Testing

- **Framework**: Vitest
- **Run tests**: `npm test`
- **Watch mode**: `npm run test:watch`

## Build

- **Build**: `npm run build`
- **TypeScript**: Strict mode enabled

## Architecture

- `src/index.ts` - Plugin entry point (config hook + refresh tool)
- `src/fetcher.ts` - Fetches models from local endpoints
- `src/openrouter.ts` - OpenRouter metadata lookup with caching
- `src/normalize.ts` - Model ID normalization
- `src/types.ts` - TypeScript type definitions

## Conventions

- Use TypeScript strict mode
- Follow TDD: write tests first, then implement
- Keep functions small and focused
- Use descriptive variable names
