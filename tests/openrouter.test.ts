import * as fs from "node:fs";
import * as path from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { lookupModelMetadata, clearCache } from "../src/openrouter";

const mockFetch = vi.fn<() => Promise<Response>>();
globalThis.fetch = mockFetch;

const CACHE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".cache",
  "opencode-autodiscover"
);
const CACHE_FILE = path.join(CACHE_DIR, "openrouter.json");

describe(lookupModelMetadata, () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCache();
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  });

  afterEach(() => {
    clearCache();
  });

  it("returns metadata for matching model", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              context_length: 131_072,
              id: "meta-llama/llama-3.3-70b-instruct",
              name: "Meta: Llama 3.3 70B Instruct",
              supported_parameters: ["tools", "temperature"],
              top_provider: { max_completion_tokens: 16_384 },
            },
          ],
        }),
      ok: true,
    } as Response);

    const metadata = await lookupModelMetadata("llama-3.3-70b-instruct");
    expect(metadata).not.toBeNull();
    expect(metadata?.context_length).toBe(131_072);
    expect(metadata?.top_provider.max_completion_tokens).toBe(16_384);
  });

  it("returns null for non-matching model", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              context_length: 131_072,
              id: "meta-llama/llama-3.3-70b-instruct",
              name: "Meta: Llama 3.3 70B Instruct",
              supported_parameters: [],
              top_provider: { max_completion_tokens: 16_384 },
            },
          ],
        }),
      ok: true,
    } as Response);

    const metadata = await lookupModelMetadata("my-custom-model");
    expect(metadata).toBeNull();
  });

  it("uses cached data when available and fresh", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              context_length: 40_960,
              id: "qwen/qwen3-32b",
              name: "Qwen: Qwen3 32B",
              supported_parameters: [],
              top_provider: { max_completion_tokens: 40_960 },
            },
          ],
        }),
      ok: true,
    } as Response);

    await lookupModelMetadata("qwen3-32b");
    expect(mockFetch).toHaveBeenCalledOnce();

    const metadata = await lookupModelMetadata("qwen3-32b");
    expect(metadata).not.toBeNull();
    expect(metadata?.context_length).toBe(40_960);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("fetches fresh data when cache is expired", async () => {
    mockFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: [
            {
              context_length: 40_960,
              id: "qwen/qwen3-32b",
              name: "Qwen: Qwen3 32B",
              supported_parameters: [],
              top_provider: { max_completion_tokens: 40_960 },
            },
          ],
        }),
      ok: true,
    } as Response);

    await lookupModelMetadata("qwen3-32b");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns null when fetch fails with decompression error", async () => {
    mockFetch.mockRejectedValueOnce(
      new TypeError("Decompression error", {
        cause: new Error("ZlibError: unexpected end of file"),
      })
    );

    const metadata = await lookupModelMetadata("llama-3.3-70b-instruct");
    expect(metadata).toBeNull();
  });

  it("sends Accept-Encoding identity to prevent compressed responses", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              context_length: 131_072,
              id: "meta-llama/llama-3.3-70b-instruct",
              name: "Meta: Llama 3.3 70B Instruct",
              supported_parameters: [],
              top_provider: { max_completion_tokens: 16_384 },
            },
          ],
        }),
      ok: true,
    } as Response);

    await lookupModelMetadata("llama-3.3-70b-instruct");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept-Encoding": "identity",
        }),
      })
    );
  });
});
