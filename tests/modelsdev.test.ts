import { describe, it, expect } from "vitest";

import { lookupModelMetadata } from "../src/modelsdev";

describe(lookupModelMetadata, () => {
  it("looks up model by full ID from models-dev-db", async () => {
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
      "anthropic/claude-sonnet-4-20250514"
    );
    expect(metadata).not.toBeNull();
    expect(metadata?.cost?.input).toBeDefined();
    expect(metadata?.cost?.output).toBeDefined();
  });

  it("includes reasoning and tool_call flags", async () => {
    const metadata = await lookupModelMetadata(
      "anthropic/claude-sonnet-4-20250514"
    );
    expect(metadata).not.toBeNull();
    expect(metadata?.reasoning).toStrictEqual(expect.any(Boolean));
    expect(metadata?.tool_call).toStrictEqual(expect.any(Boolean));
  });
});
