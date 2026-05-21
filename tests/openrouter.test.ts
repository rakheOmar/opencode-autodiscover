/* eslint-disable unicorn/prefer-event-target, promise/prefer-await-to-callbacks */
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { lookupModelMetadata, clearCache } from "../src/openrouter";

vi.mock(import("node:https"), () => ({
  default: { get: vi.fn<() => unknown>() },
  get: vi.fn<() => unknown>(),
}));

const CACHE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".cache",
  "opencode-autodiscover"
);
const CACHE_FILE = path.join(CACHE_DIR, "openrouter.json");

const mockGet = vi.mocked(https.get);

const createMockResponse = (data: unknown, statusCode = 200) => {
  const res = new EventEmitter();
  (res as Record<string, unknown>).statusCode = statusCode;

  setTimeout(() => {
    res.emit("data", JSON.stringify(data));
    res.emit("end");
  }, 10);

  return res;
};

const createMockRequest = () => {
  const req = new EventEmitter();
  // eslint-disable-next-line vitest/prefer-spy-on, vitest/require-mock-type-parameters
  (req as unknown as { end: () => void }).end = () => {};
  return req;
};

describe(lookupModelMetadata, () => {
  beforeEach(() => {
    mockGet.mockReset();
    clearCache();
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  });

  afterEach(() => {
    clearCache();
  });

  it("returns metadata for matching model", async () => {
    const data = {
      data: [
        {
          context_length: 131_072,
          id: "meta-llama/llama-3.3-70b-instruct",
          name: "Meta: Llama 3.3 70B Instruct",
          supported_parameters: ["tools", "temperature"],
          top_provider: { max_completion_tokens: 16_384 },
        },
      ],
    };

    mockGet.mockImplementation((_url, _opts, callback) => {
      const res = createMockResponse(data);
      callback(res as never);
      return createMockRequest() as never;
    });

    const metadata = await lookupModelMetadata("llama-3.3-70b-instruct");
    expect(metadata).not.toBeNull();
    expect(metadata?.context_length).toBe(131_072);
    expect(metadata?.top_provider.max_completion_tokens).toBe(16_384);
  });

  it("returns null for non-matching model", async () => {
    const data = {
      data: [
        {
          context_length: 131_072,
          id: "meta-llama/llama-3.3-70b-instruct",
          name: "Meta: Llama 3.3 70B Instruct",
          supported_parameters: [],
          top_provider: { max_completion_tokens: 16_384 },
        },
      ],
    };

    mockGet.mockImplementation((_url, _opts, callback) => {
      const res = createMockResponse(data);
      callback(res as never);
      return createMockRequest() as never;
    });

    const metadata = await lookupModelMetadata("my-custom-model");
    expect(metadata).toBeNull();
  });

  it("uses cached data when available and fresh", async () => {
    const data = {
      data: [
        {
          context_length: 40_960,
          id: "qwen/qwen3-32b",
          name: "Qwen: Qwen3 32B",
          supported_parameters: [],
          top_provider: { max_completion_tokens: 40_960 },
        },
      ],
    };

    mockGet.mockImplementation((_url, _opts, callback) => {
      const res = createMockResponse(data);
      callback(res as never);
      return createMockRequest() as never;
    });

    await lookupModelMetadata("qwen3-32b");
    expect(mockGet).toHaveBeenCalledOnce();

    const metadata = await lookupModelMetadata("qwen3-32b");
    expect(metadata).not.toBeNull();
    expect(metadata?.context_length).toBe(40_960);
    expect(mockGet).toHaveBeenCalledOnce();
  });

  it("fetches fresh data when cache is expired", async () => {
    const data = {
      data: [
        {
          context_length: 40_960,
          id: "qwen/qwen3-32b",
          name: "Qwen: Qwen3 32B",
          supported_parameters: [],
          top_provider: { max_completion_tokens: 40_960 },
        },
      ],
    };

    mockGet.mockImplementation((_url, _opts, callback) => {
      const res = createMockResponse(data);
      callback(res as never);
      return createMockRequest() as never;
    });

    await lookupModelMetadata("qwen3-32b");
    expect(mockGet).toHaveBeenCalledOnce();
  });

  it("returns null when fetch fails", async () => {
    mockGet.mockImplementation(() => {
      const req = createMockRequest();
      setTimeout(() => {
        req.emit("error", new Error("Connection failed"));
      }, 10);
      return req as never;
    });

    const metadata = await lookupModelMetadata("llama-3.3-70b-instruct");
    expect(metadata).toBeNull();
  });

  it("sends Accept-Encoding identity to prevent compressed responses", async () => {
    const data = {
      data: [
        {
          context_length: 131_072,
          id: "meta-llama/llama-3.3-70b-instruct",
          name: "Meta: Llama 3.3 70B Instruct",
          supported_parameters: [],
          top_provider: { max_completion_tokens: 16_384 },
        },
      ],
    };

    mockGet.mockImplementation((_url, _opts, callback) => {
      const res = createMockResponse(data);
      callback(res as never);
      return createMockRequest() as never;
    });

    await lookupModelMetadata("llama-3.3-70b-instruct");

    expect(mockGet).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept-Encoding": "identity",
        }),
      }),
      expect.any(Function)
    );
  });
});
