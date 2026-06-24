import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetchModels } from "../src/fetcher";

const mockFetch = vi.fn<() => Promise<Response>>();
globalThis.fetch = mockFetch;

describe(fetchModels, () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns models from OpenAI-compatible endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              created: 1_234_567_890,
              id: "llama3.3:70b",
              object: "model",
              owned_by: "ollama",
            },
            {
              created: 1_234_567_890,
              id: "codellama:13b",
              object: "model",
              owned_by: "ollama",
            },
          ],
        }),
      ok: true,
    } as Response);

    const models = await fetchModels("http://localhost:11434/v1");
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("llama3.3:70b");
    expect(models[1].id).toBe("codellama:13b");
  });

  it("sends Authorization header when apiKey provided", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ data: [] }),
      ok: true,
    } as Response);

    await fetchModels("http://localhost:8080/v1", "sk-test-key");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key",
        }),
      })
    );
  });

  it("does not send Authorization header when no apiKey", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ data: [] }),
      ok: true,
    } as Response);

    await fetchModels("http://localhost:11434/v1");

    const call = mockFetch.mock.calls[0] as unknown[];
    const { headers } = (call[1] ?? {}) as RequestInit;
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("returns empty array when endpoint is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const models = await fetchModels("http://localhost:9999/v1");
    expect(models).toStrictEqual([]);
  });

  it("returns empty array when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const models = await fetchModels("http://localhost:11434/v1");
    expect(models).toStrictEqual([]);
  });

  it("returns empty array when response format is invalid", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ invalid: "format" }),
      ok: true,
    } as Response);

    const models = await fetchModels("http://localhost:11434/v1");
    expect(models).toStrictEqual([]);
  });

  it("extracts context_length from rich response", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              context_length: 131_072,
              created: 1_234_567_890,
              id: "llama3.3:70b",
              object: "model",
            },
          ],
        }),
      ok: true,
    } as Response);

    const models = await fetchModels("http://localhost:11434/v1");
    expect(models[0].contextWindow).toBe(131_072);
  });

  it("extracts max_completion_tokens from rich response", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              created: 1_234_567_890,
              id: "llama3.3:70b",
              max_completion_tokens: 16_384,
              object: "model",
            },
          ],
        }),
      ok: true,
    } as Response);

    const models = await fetchModels("http://localhost:11434/v1");
    expect(models[0].maxOutput).toBe(16_384);
  });

  it("extracts capabilities from rich response", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              capabilities: {
                function_calling: true,
                reasoning: true,
                temperature: true,
              },
              created: 1_234_567_890,
              id: "qwen3:32b",
              object: "model",
            },
          ],
        }),
      ok: true,
    } as Response);

    const models = await fetchModels("http://localhost:11434/v1");
    expect(models[0].tool_call).toBeTruthy();
    expect(models[0].reasoning).toBeTruthy();
    expect(models[0].temperature).toBeTruthy();
  });

  it("extracts capabilities from supported_parameters", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: [
            {
              created: 1_234_567_890,
              id: "qwen3:32b",
              object: "model",
              supported_parameters: ["tools", "tool_choice", "temperature"],
            },
          ],
        }),
      ok: true,
    } as Response);

    const models = await fetchModels("http://localhost:11434/v1");
    expect(models[0].tool_call).toBeTruthy();
    expect(models[0].temperature).toBeTruthy();
  });

  it("passes custom headers through to the fetch call", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ data: [] }),
      ok: true,
    } as Response);

    const customHeaders = {
      "sleeve-base-url": "http://localhost:8081/v1",
      "sleeve-harness": "opencode",
    };

    await fetchModels("http://localhost:11434/v1", undefined, customHeaders);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "sleeve-base-url": "http://localhost:8081/v1",
          "sleeve-harness": "opencode",
        }),
      })
    );
  });

  it("does not let custom headers override Content-Type or Authorization", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ data: [] }),
      ok: true,
    } as Response);

    const customHeaders = {
      Authorization: "Bearer evil-token",
      "CONTENT-TYPE": "text/html",
      authorization: "Basic bad-creds",
      "content-type": "text/plain",
      "x-custom": "should-pass",
    };

    await fetchModels(
      "http://localhost:11434/v1",
      "sk-real-key",
      customHeaders
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/models",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer sk-real-key",
          "Content-Type": "application/json",
          "x-custom": "should-pass",
        },
      })
    );
  });

  it("converts non-string header values to strings", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ data: [] }),
      ok: true,
    } as Response);

    await fetchModels("http://localhost:11434/v1", undefined, {
      "x-count": 42,
      "x-flag": true,
      "x-name": "already-string",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-count": "42",
          "x-flag": "true",
          "x-name": "already-string",
        }),
      })
    );
  });

  it("silently skips non-object customHeaders value", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ data: [] }),
      ok: true,
    } as Response);

    await fetchModels(
      "http://localhost:11434/v1",
      undefined,
      "not-an-object" as never
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/models",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
        },
      })
    );
  });
});
