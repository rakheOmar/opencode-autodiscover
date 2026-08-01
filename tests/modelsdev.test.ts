import type { Provider } from "models-dev-db";
import { providers } from "models-dev-db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearCache, lookupModelMetadata } from "../src/modelsdev";

vi.mock(import("models-dev-db"), () => ({
  providers: vi.fn<() => Promise<Provider[]>>(),
}));

const mockProviders = vi.mocked(providers);

const gpt4o: Provider["models"]["gpt-4o"] = {
  attachment: false,
  cost: { input: 2.5, output: 10 },
  id: "gpt-4o",
  last_updated: "2024-05-13",
  limit: { context: 128_000, output: 16_384 },
  modalities: { input: ["text"], output: ["text"] },
  name: "GPT-4o",
  open_weights: false,
  reasoning: false,
  release_date: "2024-05-13",
  temperature: true,
  tool_call: true,
};

const claudeSonnet4: Provider["models"]["claude-sonnet-4-20250514"] = {
  attachment: false,
  cost: { input: 3, output: 15 },
  id: "claude-sonnet-4-20250514",
  last_updated: "2025-05-14",
  limit: { context: 200_000, output: 64_000 },
  modalities: { input: ["text"], output: ["text"] },
  name: "Claude Sonnet 4",
  open_weights: false,
  reasoning: true,
  release_date: "2025-05-14",
  tool_call: true,
};

const createProvider = (id: string, models: Provider["models"]): Provider => ({
  doc: `https://${id}.example.com`,
  env: [],
  id,
  models,
  name: id,
  npm: "@ai-sdk/test",
});

describe(lookupModelMetadata, () => {
  beforeEach(() => {
    clearCache();
    mockProviders.mockReset();
    mockProviders.mockResolvedValue([
      createProvider("openai", { "gpt-4o": gpt4o }),
      createProvider("anthropic", {
        "claude-sonnet-4-20250514": claudeSonnet4,
      }),
    ]);
  });
  it("looks up model by full provider/model ID", async () => {
    const metadata = await lookupModelMetadata("openai/gpt-4o");
    expect(metadata).not.toBeNull();
    expect(metadata?.limit.context).toBe(128_000);
    expect(metadata?.cost?.input).toBe(2.5);
  });

  it("looks up model by terminal name", async () => {
    const metadata = await lookupModelMetadata("gpt-4o");
    expect(metadata).not.toBeNull();
    expect(metadata?.limit.context).toBe(128_000);
  });

  it("returns null for unknown model", async () => {
    const metadata = await lookupModelMetadata("my-custom-model-xyz");
    expect(metadata).toBeNull();
  });

  it("includes cost data", async () => {
    const metadata = await lookupModelMetadata(
      "anthropic/claude-sonnet-4-20250514",
    );
    expect(metadata?.cost?.input).toBe(3);
    expect(metadata?.cost?.output).toBe(15);
  });

  it("includes reasoning and tool_call flags", async () => {
    const metadata = await lookupModelMetadata(
      "anthropic/claude-sonnet-4-20250514",
    );
    expect(metadata?.reasoning).toBeTruthy();
    expect(metadata?.tool_call).toBeTruthy();
  });

  it("caches the lookup map and rebuilds after clearCache", async () => {
    await lookupModelMetadata("gpt-4o");
    expect(mockProviders).toHaveBeenCalledOnce();

    await lookupModelMetadata("gpt-4o");
    expect(mockProviders).toHaveBeenCalledOnce();

    clearCache();
    await lookupModelMetadata("gpt-4o");
    expect(mockProviders).toHaveBeenCalledTimes(2);
  });
});
