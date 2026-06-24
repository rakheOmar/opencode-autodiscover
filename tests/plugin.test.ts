import { describe, it, expect, vi, beforeEach } from "vitest";

import type {
  DiscoveredModel,
  OpenRouterModel,
  ModelsDevModel,
} from "../src/types";

const mockFetch = vi.fn<() => Promise<Response>>();
globalThis.fetch = mockFetch;

vi.mock(import("../src/fetcher"), () => ({
  fetchModels: vi.fn<() => Promise<DiscoveredModel[]>>(),
}));

vi.mock(import("../src/openrouter"), () => ({
  clearCache: vi.fn<() => void>(),
  getAllModels: vi.fn<() => Promise<OpenRouterModel[]>>(),
  lookupModelMetadata: vi.fn<() => Promise<OpenRouterModel | null>>(),
}));

vi.mock(import("../src/modelsdev"), () => ({
  clearCache: vi.fn<() => void>(),
  ensureCache: vi.fn<() => Promise<Record<string, ModelsDevModel>>>(),
  lookupModelMetadata: vi.fn<() => Promise<ModelsDevModel | null>>(),
}));

const { fetchModels } = await import("../src/fetcher");
const { lookupModelMetadata, getAllModels } = await import("../src/openrouter");
const { ensureCache } = await import("../src/modelsdev");

const mockFetchModels = vi.mocked(fetchModels);
const mockLookupModelMetadata = vi.mocked(lookupModelMetadata);
const mockGetAllModels = vi.mocked(getAllModels);
const mockEnsureCache = vi.mocked(ensureCache);

const createMockInput = () => ({
  $: vi.fn<() => void>() as never,
  client: {
    app: { log: vi.fn<() => void>() },
  } as never,
  directory: "/test",
  experimental_workspace: {
    register: vi.fn<() => void>(),
  },
  project: {} as never,
  serverUrl: new URL("http://localhost:3000"),
  worktree: "/test",
});

describe("LocalModelsPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllModels.mockResolvedValue([]);
    mockEnsureCache.mockResolvedValue({});
  });

  it("discovers models from configured providers", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

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
    } as Record<
      string,
      Record<
        string,
        {
          name: string;
          options: { baseURL: string };
          models?: Record<string, unknown>;
        }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:11434/v1",
      undefined,
      undefined
    );
    expect(config.provider["local-ollama"].models).toBeDefined();
    expect(
      config.provider["local-ollama"].models?.["llama3.3:70b"]
    ).toBeDefined();
  });

  it("uses API key from config", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

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
    } as Record<
      string,
      Record<
        string,
        { name: string; options: { apiKey: string; baseURL: string } }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:8080/v1",
      "sk-test-key",
      undefined
    );
  });

  it("merges discovered models with existing config models", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

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
    } as Record<
      string,
      Record<
        string,
        {
          name: string;
          options: { baseURL: string };
          models?: Record<string, unknown>;
        }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(
      config.provider["local-ollama"].models?.["custom-model"]
    ).toBeDefined();
    expect(
      config.provider["local-ollama"].models?.["llama3.3:70b"]
    ).toBeDefined();
  });

  it("handles multiple providers", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

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
    } as Record<
      string,
      Record<string, { name: string; options: { baseURL: string } }>
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(mockFetchModels).toHaveBeenCalledTimes(2);
    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:11434/v1",
      undefined,
      undefined
    );
    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:1234/v1",
      undefined,
      undefined
    );
  });

  it("continues with empty models when endpoint is unreachable", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

    mockFetchModels.mockResolvedValue([]);

    const config = {
      provider: {
        "local-ollama": {
          name: "Ollama",
          options: { baseURL: "http://localhost:11434/v1" },
        },
      },
    } as Record<
      string,
      Record<
        string,
        {
          name: string;
          options: { baseURL: string };
          models?: Record<string, unknown>;
        }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(config.provider["local-ollama"].models).toStrictEqual({});
  });

  it("excludes models matching exclude patterns", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

    mockFetchModels.mockResolvedValue([
      { id: "llama3.3:70b", name: "llama3.3:70b" },
      { id: "bge-embedding-v2", name: "bge-embedding-v2" },
      { id: "nomic-embed-text", name: "nomic-embed-text" },
    ]);

    mockLookupModelMetadata.mockResolvedValue(null);

    const config = {
      provider: {
        "local-ollama": {
          name: "Ollama",
          options: {
            baseURL: "http://localhost:11434/v1",
            exclude: ["*embedding*", "*embed*"],
          },
        },
      },
    } as Record<
      string,
      Record<
        string,
        {
          name: string;
          options: { baseURL: string; exclude?: string[] };
          models?: Record<string, unknown>;
        }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(
      config.provider["local-ollama"].models?.["llama3.3:70b"]
    ).toBeDefined();
    expect(
      config.provider["local-ollama"].models?.["bge-embedding-v2"]
    ).toBeUndefined();
    expect(
      config.provider["local-ollama"].models?.["nomic-embed-text"]
    ).toBeUndefined();
  });

  it("includes only models matching include patterns", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

    mockFetchModels.mockResolvedValue([
      { id: "qwen/qwen3", name: "qwen/qwen3" },
      { id: "openai/gpt-4o", name: "openai/gpt-4o" },
      { id: "qwen/qwen3-coder", name: "qwen/qwen3-coder" },
    ]);

    mockLookupModelMetadata.mockResolvedValue(null);

    const config = {
      provider: {
        "local-ollama": {
          name: "Ollama",
          options: {
            baseURL: "http://localhost:11434/v1",
            include: ["qwen/*"],
          },
        },
      },
    } as Record<
      string,
      Record<
        string,
        {
          name: string;
          options: { baseURL: string; include?: string[] };
          models?: Record<string, unknown>;
        }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(
      config.provider["local-ollama"].models?.["qwen/qwen3"]
    ).toBeDefined();
    expect(
      config.provider["local-ollama"].models?.["qwen/qwen3-coder"]
    ).toBeDefined();
    expect(
      config.provider["local-ollama"].models?.["openai/gpt-4o"]
    ).toBeUndefined();
  });

  it("exclude carves out of include pool", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

    mockFetchModels.mockResolvedValue([
      { id: "qwen/qwen3", name: "qwen/qwen3" },
      { id: "qwen/test-model", name: "qwen/test-model" },
      { id: "openai/gpt-4o", name: "openai/gpt-4o" },
    ]);

    mockLookupModelMetadata.mockResolvedValue(null);

    const config = {
      provider: {
        "local-ollama": {
          name: "Ollama",
          options: {
            baseURL: "http://localhost:11434/v1",
            exclude: ["*test*"],
            include: ["qwen/*"],
          },
        },
      },
    } as Record<
      string,
      Record<
        string,
        {
          name: string;
          options: { baseURL: string; include?: string[]; exclude?: string[] };
          models?: Record<string, unknown>;
        }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(
      config.provider["local-ollama"].models?.["qwen/qwen3"]
    ).toBeDefined();
    expect(
      config.provider["local-ollama"].models?.["qwen/test-model"]
    ).toBeUndefined();
    expect(
      config.provider["local-ollama"].models?.["openai/gpt-4o"]
    ).toBeUndefined();
  });

  it("preserves explicitly configured models even when filter would exclude them", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

    mockFetchModels.mockResolvedValue([
      { id: "qwen/qwen3", name: "qwen/qwen3" },
      { id: "bge-embedding", name: "bge-embedding" },
    ]);

    mockLookupModelMetadata.mockResolvedValue(null);

    const config = {
      provider: {
        "local-ollama": {
          exclude: ["*embedding*"],
          models: {
            "bge-embedding": {
              limit: { context: 8192, output: 1024 },
              name: "My Embedding Model",
            },
          },
          name: "Ollama",
          options: { baseURL: "http://localhost:11434/v1" },
        },
      },
    } as Record<
      string,
      Record<
        string,
        {
          name: string;
          options: { baseURL: string };
          models?: Record<string, unknown>;
          exclude?: string[];
        }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(
      config.provider["local-ollama"].models?.["qwen/qwen3"]
    ).toBeDefined();
    expect(
      config.provider["local-ollama"].models?.["bge-embedding"]
    ).toBeDefined();
  });

  it("passes custom headers from provider options to fetchModels", async () => {
    const { LocalModelsPlugin } = await import("../src/index");

    mockFetchModels.mockResolvedValue([]);

    const config = {
      provider: {
        "local-proxy": {
          name: "Proxy",
          options: {
            baseURL: "http://localhost:8081/v1",
            headers: {
              "sleeve-base-url": "http://optiplex-3020:8081/v1",
              "sleeve-harness": "opencode",
            },
          },
        },
      },
    } as Record<
      string,
      Record<
        string,
        {
          name: string;
          options: {
            baseURL: string;
            headers?: Record<string, string>;
          };
        }
      >
    >;

    const hooks = await LocalModelsPlugin(createMockInput());

    if (hooks.config) {
      await hooks.config(config as never);
    }

    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:8081/v1",
      undefined,
      {
        "sleeve-base-url": "http://optiplex-3020:8081/v1",
        "sleeve-harness": "opencode",
      }
    );
  });
});
