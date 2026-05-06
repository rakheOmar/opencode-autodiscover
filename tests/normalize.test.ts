import { describe, it, expect } from "vitest";

import { normalizeModelId } from "../src/normalize";

describe(normalizeModelId, () => {
  it("converts to lowercase", () => {
    expect(normalizeModelId("LLAMA3.3:70B")).toBe("llama3.3-70b");
  });

  it("strips models/ prefix", () => {
    expect(normalizeModelId("models/llama-3.3-70b-instruct")).toBe(
      "llama-3.3-70b-instruct"
    );
  });

  it("replaces : with -", () => {
    expect(normalizeModelId("llama3.3:70b")).toBe("llama3.3-70b");
  });

  it("handles combination of transformations", () => {
    expect(normalizeModelId("Models/LLAMA3.3:70B")).toBe("llama3.3-70b");
  });

  it("handles already normalized IDs", () => {
    expect(normalizeModelId("llama-3.3-70b")).toBe("llama-3.3-70b");
  });

  it("handles IDs without prefix or special chars", () => {
    expect(normalizeModelId("gpt-4")).toBe("gpt-4");
  });

  it("strips org prefix from OpenRouter-style IDs", () => {
    expect(normalizeModelId("meta-llama/llama-3.3-70b-instruct")).toBe(
      "llama-3.3-70b-instruct"
    );
  });

  it("strips org prefix and normalizes", () => {
    expect(normalizeModelId("qwen/Qwen3:32B")).toBe("qwen3-32b");
  });
});
