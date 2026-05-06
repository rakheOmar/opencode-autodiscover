import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetchModels } from "../src/fetcher";
import { LocalModelsPlugin } from "../src/index";
import { lookupModelMetadata } from "../src/openrouter";

const mockFetch = vi.fn<() => Promise<Response>>();
globalThis.fetch = mockFetch;

vi.mock(import("../src/fetcher"), () => ({
  fetchModels: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock(import("../src/openrouter"), () => ({
  clearCache: vi.fn<() => void>(),
  getAllModels: vi.fn<() => Promise<unknown[]>>(),
  lookupModelMetadata: vi.fn<() => Promise<unknown>>(),
}));

const mockFetchModels = vi.mocked(fetchModels);
const mockLookupModelMetadata = vi.mocked(lookupModelMetadata);

describe(LocalModelsPlugin, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("discovers models from configured providers", async () => {
    mockFetchModels.mockResolvedValue([
      { id: "llama3.3:70b", name: "llama3.3:70b" },
    ]);

    mockLookupModelMetadata.mockResolvedValue({
      context_length: 131_072,
      id: "meta-llama/llama-3.3-70b-instruct",
      name: "Meta: Llama 3.3 70B Instruct",
      supported_parameters: ["tools", "temperature"],
      top_provider: { max_completion_tokens: 16_384 },
    });

    const config = {
      provider: {
        "local-ollama": {
          name: "Ollama",
          options: {
            baseURL: "http://localhost:11434/v1",
          },
        },
      },
    };

    const hooks = await LocalModelsPlugin({
      $: vi.fn<() => void>() as unknown,
      client: {
        app: { log: vi.fn<() => void>() },
      } as unknown,
      directory: "/test",
      project: {} as unknown,
      worktree: "/test",
    });

    if (hooks.config) {
      await hooks.config(config);
    }

    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:11434/v1",
      undefined
    );
    expect(config.provider["local-ollama"].models).toBeDefined();
    expect(
      config.provider["local-ollama"].models["llama3.3:70b"]
    ).toBeDefined();
  });

  it("uses API key from config", async () => {
    mockFetchModels.mockResolvedValue([]);

    const config = {
      provider: {
        "local-proxy": {
          name: "Proxy",
          options: {
            apiKey: "sk-test-key",
            baseURL: "http://localhost:8080/v1",
          },
        },
      },
    };

    const hooks = await LocalModelsPlugin({
      $: vi.fn<() => void>() as unknown,
      client: {
        app: { log: vi.fn<() => void>() },
      } as unknown,
      directory: "/test",
      project: {} as unknown,
      worktree: "/test",
    });

    if (hooks.config) {
      await hooks.config(config);
    }

    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:8080/v1",
      "sk-test-key"
    );
  });

  it("merges discovered models with existing config models", async () => {
    mockFetchModels.mockResolvedValue([
      { id: "llama3.3:70b", name: "llama3.3:70b" },
    ]);

    mockLookupModelMetadata.mockResolvedValue(null);

    const config = {
      provider: {
        "local-ollama": {
          models: {
            "custom-model": {
              limit: { context: 128_000, output: 8192 },
              name: "Custom Model",
            },
          },
          name: "Ollama",
          options: {
            baseURL: "http://localhost:11434/v1",
          },
        },
      },
    };

    const hooks = await LocalModelsPlugin({
      $: vi.fn<() => void>() as unknown,
      client: {
        app: { log: vi.fn<() => void>() },
      } as unknown,
      directory: "/test",
      project: {} as unknown,
      worktree: "/test",
    });

    if (hooks.config) {
      await hooks.config(config);
    }

    expect(
      config.provider["local-ollama"].models["custom-model"]
    ).toBeDefined();
    expect(
      config.provider["local-ollama"].models["llama3.3:70b"]
    ).toBeDefined();
  });

  it("handles multiple providers", async () => {
    mockFetchModels.mockResolvedValue([]);

    const config = {
      provider: {
        "local-lmstudio": {
          name: "LM Studio",
          options: { baseURL: "http://localhost:1234/v1" },
        },
        "local-ollama": {
          name: "Ollama",
          options: { baseURL: "http://localhost:11434/v1" },
        },
      },
    };

    const hooks = await LocalModelsPlugin({
      $: vi.fn<() => void>() as unknown,
      client: {
        app: { log: vi.fn<() => void>() },
      } as unknown,
      directory: "/test",
      project: {} as unknown,
      worktree: "/test",
    });

    if (hooks.config) {
      await hooks.config(config);
    }

    expect(mockFetchModels).toHaveBeenCalledTimes(2);
    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:11434/v1",
      undefined
    );
    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:1234/v1",
      undefined
    );
  });

  it("continues with empty models when endpoint is unreachable", async () => {
    mockFetchModels.mockResolvedValue([]);

    const config = {
      provider: {
        "local-ollama": {
          name: "Ollama",
          options: { baseURL: "http://localhost:11434/v1" },
        },
      },
    };

    const hooks = await LocalModelsPlugin({
      $: vi.fn<() => void>() as unknown,
      client: {
        app: { log: vi.fn<() => void>() },
      } as unknown,
      directory: "/test",
      project: {} as unknown,
      worktree: "/test",
    });

    if (hooks.config) {
      await hooks.config(config);
    }

    expect(config.provider["local-ollama"].models).toStrictEqual({});
  });
});
