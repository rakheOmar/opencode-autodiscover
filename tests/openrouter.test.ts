/* eslint-disable unicorn/prefer-event-target, promise/prefer-await-to-callbacks */
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as https from "node:https";
import * as os from "node:os";
import path from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  clearCache as clearCacheType,
  lookupModelMetadata as lookupModelMetadataType,
} from "../src/openrouter";

// https.get is overloaded; use the permissive signature so the mock is
// assignable to the overload union.
vi.mock(import("node:https"), () => ({
  get: vi.fn<(...args: unknown[]) => never>(),
}));

// Cache dir is derived from the env var at module load, so it must be set
// before the module under test is imported (done via beforeAll below).
const CACHE_DIR_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "opencode-autodiscover-test-")
);
process.env.OPENCODE_AUTODISCOVER_CACHE_DIR = CACHE_DIR_ROOT;

const CACHE_DIR = path.join(CACHE_DIR_ROOT, ".cache", "opencode-autodiscover");
const CACHE_FILE = path.join(CACHE_DIR, "openrouter.json");

const mockGet = vi.mocked(https.get);

const createMockResponse = (data: unknown, statusCode = 200) => {
  const res = new EventEmitter();
  (res as unknown as Record<string, unknown>).statusCode = statusCode;

  setTimeout(() => {
    res.emit("data", JSON.stringify(data));
    res.emit("end");
  }, 10);

  return res;
};

const createMockRequest = () => {
  const req = new EventEmitter();
  const mock = req as unknown as { end: () => void; destroy: () => void };
  // eslint-disable-next-line vitest/prefer-spy-on, vitest/require-mock-type-parameters
  mock.end = () => {};
  mock.destroy = () => {};
  return req;
};

let lookupModelMetadata: typeof lookupModelMetadataType;
let clearCache: typeof clearCacheType;

describe("lookupModelMetadata", () => {
  // Static import would evaluate the module before OPENCODE_AUTODISCOVER_CACHE_DIR
  // is set; the env var must precede module load, so import it here instead.
  beforeAll(async () => {
    ({ lookupModelMetadata, clearCache } = await import("../src/openrouter"));
  });

  beforeEach(() => {
    mockGet.mockReset();
    clearCache();
  });

  afterEach(() => {
    clearCache();
  });

  afterAll(() => {
    fs.rmSync(CACHE_DIR_ROOT, { force: true, recursive: true });
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
      callback?.(res as never);
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
      callback?.(res as never);
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
      callback?.(res as never);
      return createMockRequest() as never;
    });

    await lookupModelMetadata("qwen3-32b");
    expect(mockGet).toHaveBeenCalledOnce();

    const metadata = await lookupModelMetadata("qwen3-32b");
    expect(metadata).not.toBeNull();
    expect(metadata?.context_length).toBe(40_960);
    expect(mockGet).toHaveBeenCalledOnce();
  });

  it("refetches when the on-disk cache is expired", async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({
        models: [
          {
            context_length: 1024,
            id: "stale/model",
            name: "Stale",
            supported_parameters: [],
            top_provider: { max_completion_tokens: 1024 },
          },
        ],
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
      })
    );

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
      callback?.(res as never);
      return createMockRequest() as never;
    });

    const metadata = await lookupModelMetadata("qwen3-32b");
    expect(metadata?.context_length).toBe(40_960);
    expect(mockGet).toHaveBeenCalledOnce();
  });

  it("clearCache removes the on-disk cache", async () => {
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
      callback?.(res as never);
      return createMockRequest() as never;
    });

    await lookupModelMetadata("qwen3-32b");
    expect(fs.existsSync(CACHE_FILE)).toBeTruthy();
    expect(mockGet).toHaveBeenCalledOnce();

    clearCache();
    expect(fs.existsSync(CACHE_FILE)).toBeFalsy();

    await lookupModelMetadata("qwen3-32b");
    expect(mockGet).toHaveBeenCalledTimes(2);
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

  it("resolves to null when the request times out", async () => {
    vi.useFakeTimers();
    try {
      mockGet.mockReturnValue(createMockRequest() as never);

      const pending = lookupModelMetadata("llama-3.3-70b-instruct");
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toBeNull();
      expect(mockGet).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
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
      callback?.(res as never);
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
