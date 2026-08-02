import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DiscoveredModel,
  ModelsDevModel,
  OpenRouterModel,
} from "../src/types";

vi.mock(import("../src/fetcher"), () => ({
  fetchModels: vi.fn<() => Promise<DiscoveredModel[]>>(),
}));

vi.mock(import("../src/openrouter"), () => ({
  clearCache: vi.fn<() => void>(),
  lookupModelMetadata: vi.fn<() => Promise<OpenRouterModel | null>>(),
}));

vi.mock(import("../src/modelsdev"), () => ({
  clearCache: vi.fn<() => void>(),
  lookupModelMetadata: vi.fn<() => Promise<ModelsDevModel | null>>(),
}));

const { default: plugin } = await import("../src/index");
const { fetchModels } = await import("../src/fetcher");
const {
  clearCache: clearOpenRouterCache,
  lookupModelMetadata: lookupOpenRouterMetadata,
} = await import("../src/openrouter");
const {
  clearCache: clearModelsDevCache,
  lookupModelMetadata: lookupModelsDevMetadata,
} = await import("../src/modelsdev");

const mockFetchModels = vi.mocked(fetchModels);
const mockLookupOpenRouterMetadata = vi.mocked(lookupOpenRouterMetadata);
const mockLookupModelsDevMetadata = vi.mocked(lookupModelsDevMetadata);
const mockClearOpenRouterCache = vi.mocked(clearOpenRouterCache);
const mockClearModelsDevCache = vi.mocked(clearModelsDevCache);

const createModel = (id: string): DiscoveredModel => ({ id, name: id });

const createEndpoint = (
  id: string,
  baseURL: string,
  extra: Record<string, unknown> = {}
) => ({ baseURL, id, ...extra });

interface ProviderDraft {
  name: string;
  package: string;
  settings: Record<string, unknown>;
}

interface ModelDraft {
  capabilities: { input: string[]; output: string[]; tools: boolean };
  cost: unknown[];
  enabled: boolean;
  id: string;
  limit: { context: number; output: number };
  name: string;
}

interface RefreshTool {
  name: string;
  description: string;
  execute: (
    input: unknown,
    context: unknown
  ) => Promise<{ content?: string; output?: unknown }>;
}

const createMockContext = (options: Readonly<Record<string, unknown>> = {}) => {
  const providerDraft: ProviderDraft = { name: "", package: "", settings: {} };
  const modelDraft: ModelDraft = {
    capabilities: { input: [], output: [], tools: false },
    cost: [],
    enabled: false,
    id: "",
    limit: { context: 0, output: 0 },
    name: "",
  };

  const catalog = {
    model: {
      get: vi.fn<(_providerId: string, _modelId: string) => unknown>(
        (_providerId, _modelId) => {}
      ),
      update: vi.fn<
        (
          providerId: string,
          modelId: string,
          update: (draft: ModelDraft) => void
        ) => void
      >((_providerId, _modelId, update) => {
        update(modelDraft);
      }),
    },
    provider: {
      update: vi.fn<
        (id: string, update: (draft: ProviderDraft) => void) => void
      >((_id, update) => {
        update(providerDraft);
      }),
    },
  };
  let applyTransform: ((draft: typeof catalog) => void) | undefined;
  // Mirrors the server: registration stores the callback; reload() replays it.
  const catalogTransform = vi.fn<
    (callback: (draft: typeof catalog) => void) => Promise<{
      dispose: () => void;
    }>
  >((callback) => {
    applyTransform = callback;
    return Promise.resolve({ dispose: vi.fn<() => void>() });
  });
  const reload = vi.fn<() => Promise<void>>(() => {
    if (applyTransform) {
      applyTransform(catalog);
    }
    return Promise.resolve();
  });

  const toolDraft = { add: vi.fn<(tool: RefreshTool) => void>() };
  // The server applies tool transforms at registration; the mock must too.
  const toolTransform = vi.fn<
    (callback: (draft: typeof toolDraft) => void) => Promise<{
      dispose: () => void;
    }>
  >((callback) => {
    callback(toolDraft);
    return Promise.resolve({ dispose: vi.fn<() => void>() });
  });

  return {
    catalog,
    ctx: {
      catalog: { reload, transform: catalogTransform },
      options,
      tool: { transform: toolTransform },
    } as never,
    modelDraft,
    providerDraft,
    reload,
    toolDraft,
  };
};

describe("autodiscover plugin (v2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers providers and models from configured endpoints", async () => {
    mockFetchModels.mockResolvedValue([
      createModel("llama3.3:70b"),
      createModel("qwen2.5:7b"),
    ]);
    mockLookupOpenRouterMetadata.mockResolvedValue(null);
    mockLookupModelsDevMetadata.mockResolvedValue(null);

    const { catalog, ctx, modelDraft, providerDraft, reload } =
      createMockContext({
        endpoints: [createEndpoint("ollama", "http://localhost:11434/v1")],
      });

    await plugin.setup(ctx);

    expect(providerDraft).toMatchObject({
      package: "@ai-sdk/openai-compatible",
      settings: { baseURL: "http://localhost:11434/v1" },
    });
    expect(
      catalog.model.update.mock.calls.map(([providerId, modelId]) => [
        providerId,
        modelId,
      ])
    ).toStrictEqual([
      ["ollama", "llama3.3:70b"],
      ["ollama", "qwen2.5:7b"],
    ]);
    expect(modelDraft).toMatchObject({ enabled: true, name: "qwen2.5:7b" });
    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:11434/v1",
      undefined,
      undefined
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it("passes API key and custom headers to fetchModels and provider settings", async () => {
    mockFetchModels.mockResolvedValue([createModel("llama3.3:70b")]);
    mockLookupOpenRouterMetadata.mockResolvedValue(null);
    mockLookupModelsDevMetadata.mockResolvedValue(null);

    const { ctx, providerDraft } = createMockContext({
      endpoints: [
        createEndpoint("lmstudio", "http://localhost:1234/v1", {
          apiKey: "sk-abc",
          headers: { "x-custom": "1" },
        }),
      ],
    });

    await plugin.setup(ctx);

    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:1234/v1",
      "sk-abc",
      { "x-custom": "1" }
    );
    expect(providerDraft.settings).toStrictEqual({
      apiKey: "sk-abc",
      baseURL: "http://localhost:1234/v1",
      headers: { "x-custom": "1" },
    });
  });

  it("falls back to the OPENCODE_LOCAL_<ID>_API_KEY environment variable", async () => {
    process.env.OPENCODE_LOCAL_LM_STUDIO_API_KEY = "sk-env";
    try {
      mockFetchModels.mockResolvedValue([createModel("llama3.3:70b")]);
      mockLookupOpenRouterMetadata.mockResolvedValue(null);
      mockLookupModelsDevMetadata.mockResolvedValue(null);

      const { ctx, providerDraft } = createMockContext({
        endpoints: [createEndpoint("lm-studio", "http://localhost:1234/v1")],
      });

      await plugin.setup(ctx);

      expect(mockFetchModels).toHaveBeenCalledWith(
        "http://localhost:1234/v1",
        "sk-env",
        undefined
      );
      expect(providerDraft.settings).toMatchObject({ apiKey: "sk-env" });
    } finally {
      delete process.env.OPENCODE_LOCAL_LM_STUDIO_API_KEY;
    }
  });

  it("applies include and exclude patterns before registering models", async () => {
    mockFetchModels.mockResolvedValue([
      createModel("llama3.3:70b"),
      createModel("qwen2.5:7b"),
      createModel("embedding-model"),
    ]);
    mockLookupOpenRouterMetadata.mockResolvedValue(null);
    mockLookupModelsDevMetadata.mockResolvedValue(null);

    const { catalog, ctx } = createMockContext({
      endpoints: [
        createEndpoint("ollama", "http://localhost:11434/v1", {
          exclude: ["embedding-*"],
          include: ["*:70b", "qwen2.5:*"],
        }),
      ],
    });

    await plugin.setup(ctx);

    expect(catalog.model.update).toHaveBeenCalledTimes(2);
    expect(catalog.model.update).toHaveBeenCalledWith(
      "ollama",
      "llama3.3:70b",
      expect.any(Function)
    );
    expect(catalog.model.update).toHaveBeenCalledWith(
      "ollama",
      "qwen2.5:7b",
      expect.any(Function)
    );
    expect(catalog.model.update).not.toHaveBeenCalledWith(
      "ollama",
      "embedding-model",
      expect.any(Function)
    );
  });

  it("does nothing when no endpoints are configured", async () => {
    const { catalog, ctx, reload, toolDraft } = createMockContext({});

    await plugin.setup(ctx);

    expect(catalog.provider.update).not.toHaveBeenCalled();
    expect(catalog.model.update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(toolDraft.add).not.toHaveBeenCalled();
    expect(mockFetchModels).not.toHaveBeenCalled();
  });

  it("skips endpoints with invalid id or baseURL", async () => {
    mockFetchModels.mockResolvedValue([createModel("llama3.3:70b")]);
    mockLookupOpenRouterMetadata.mockResolvedValue(null);
    mockLookupModelsDevMetadata.mockResolvedValue(null);

    const { catalog, ctx } = createMockContext({
      endpoints: [
        createEndpoint("bad", "not a url"),
        createEndpoint("", "http://localhost:1/v1"),
        createEndpoint("ok", "http://localhost:11434/v1"),
      ],
    });

    await plugin.setup(ctx);

    expect(catalog.provider.update).toHaveBeenCalledOnce();
    expect(mockFetchModels).toHaveBeenCalledWith(
      "http://localhost:11434/v1",
      undefined,
      undefined
    );
  });

  it("preserves models already defined by the user", async () => {
    mockFetchModels.mockResolvedValue([
      createModel("custom-model"),
      createModel("llama3.3:70b"),
    ]);
    mockLookupOpenRouterMetadata.mockResolvedValue(null);
    mockLookupModelsDevMetadata.mockResolvedValue(null);

    const { catalog, ctx } = createMockContext({
      endpoints: [createEndpoint("ollama", "http://localhost:11434/v1")],
    });
    catalog.model.get.mockImplementation(
      (_providerId: string, modelId: string) =>
        modelId === "custom-model" ? { id: "custom-model" } : undefined
    );

    await plugin.setup(ctx);

    expect(catalog.model.update).toHaveBeenCalledExactlyOnceWith(
      "ollama",
      "llama3.3:70b",
      expect.any(Function)
    );
    expect(catalog.model.update).not.toHaveBeenCalledWith(
      "ollama",
      "custom-model",
      expect.any(Function)
    );
  });

  it("enriches model limits with OpenRouter metadata and cost with Models.dev", async () => {
    mockFetchModels.mockResolvedValue([createModel("llama3.3:70b")]);
    mockLookupOpenRouterMetadata.mockResolvedValue({
      context_length: 131_072,
      top_provider: { max_completion_tokens: 8192 },
    } as OpenRouterModel);
    mockLookupModelsDevMetadata.mockResolvedValue({
      cost: { cache_read: 0.25, input: 0.5, output: 1 },
    } as ModelsDevModel);

    const { ctx, modelDraft } = createMockContext({
      endpoints: [createEndpoint("ollama", "http://localhost:11434/v1")],
    });

    await plugin.setup(ctx);

    expect(modelDraft.limit).toStrictEqual({ context: 131_072, output: 8192 });
    expect(modelDraft.cost).toStrictEqual([
      { cache: { read: 0.25, write: 0 }, input: 0.5, output: 1 },
    ]);
    expect(modelDraft.capabilities.tools).toBeFalsy();
  });

  it("registers the refresh tool", async () => {
    mockFetchModels.mockResolvedValue([createModel("llama3.3:70b")]);
    mockLookupOpenRouterMetadata.mockResolvedValue(null);
    mockLookupModelsDevMetadata.mockResolvedValue(null);

    const { ctx, toolDraft } = createMockContext({
      endpoints: [createEndpoint("ollama", "http://localhost:11434/v1")],
    });

    await plugin.setup(ctx);

    expect(toolDraft.add).toHaveBeenCalledOnce();
    const [[tool]] = toolDraft.add.mock.calls;
    expect(tool.name).toBe("refresh-local-models");
    expect(tool.execute).toBeTypeOf("function");
  });

  it("refresh tool clears caches, re-discovers, and replays the catalog", async () => {
    mockFetchModels.mockResolvedValue([createModel("llama3.3:70b")]);
    mockLookupOpenRouterMetadata.mockResolvedValue(null);
    mockLookupModelsDevMetadata.mockResolvedValue(null);

    const { ctx, reload, toolDraft } = createMockContext({
      endpoints: [createEndpoint("ollama", "http://localhost:11434/v1")],
    });

    await plugin.setup(ctx);
    const [[tool]] = toolDraft.add.mock.calls;

    const result = await tool.execute({}, {});

    expect(mockClearOpenRouterCache).toHaveBeenCalledOnce();
    expect(mockClearModelsDevCache).toHaveBeenCalledOnce();
    expect(mockFetchModels).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(result.content).toContain("refreshed");
  });
});
