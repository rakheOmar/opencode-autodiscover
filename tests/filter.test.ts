import { describe, it, expect } from "vitest";

import { matchesFilter } from "../src/filter.js";

describe(matchesFilter, () => {
  it("passes everything when no filters are set", () => {
    expect(matchesFilter("openai/gpt-4o", [], [])).toBeTruthy();
    expect(matchesFilter("qwen/qwen3", [], [])).toBeTruthy();
    expect(matchesFilter("bge-m3", [], [])).toBeTruthy();
  });

  it("excludes models matching an exclude pattern", () => {
    expect(matchesFilter("bge-embedding-v2", [], ["*embedding*"])).toBeFalsy();
    expect(matchesFilter("nomic-embed-text", [], ["*embed*"])).toBeFalsy();
  });

  it("keeps models that do not match exclude pattern", () => {
    expect(matchesFilter("qwen/qwen3", [], ["*embedding*"])).toBeTruthy();
    expect(matchesFilter("openai/gpt-4o", [], ["*embed*"])).toBeTruthy();
  });

  it("include selects only matching models", () => {
    expect(matchesFilter("qwen/qwen3", ["qwen/*"], [])).toBeTruthy();
    expect(matchesFilter("openai/gpt-4o", ["qwen/*"], [])).toBeFalsy();
  });

  it("exclude carves out of include pool", () => {
    expect(matchesFilter("qwen/qwen3", ["qwen/*"], ["*test*"])).toBeTruthy();
    expect(
      matchesFilter("qwen/test-model", ["qwen/*"], ["*test*"])
    ).toBeFalsy();
  });

  it("matches case-insensitively", () => {
    expect(matchesFilter("openai/GPT-4o", ["*gpt*"], [])).toBeTruthy();
    expect(matchesFilter("OpenAI/gpt-4o", [], ["*GPT*"])).toBeFalsy();
  });

  it("wildcard matches slash in model IDs", () => {
    expect(matchesFilter("qwen/qwen3-30b", ["*"], [])).toBeTruthy();
    expect(matchesFilter("qwen/qwen3-30b", ["qwen/*"], [])).toBeTruthy();
  });

  it("handles special regex characters as literals", () => {
    expect(matchesFilter("model.v2", ["model.v2"], [])).toBeTruthy();
    expect(matchesFilter("model-v2", ["model.v2"], [])).toBeFalsy();
    expect(matchesFilter("model[v2]", ["model[v2]"], [])).toBeTruthy();
  });

  it("filters embedding models with *embed*", () => {
    expect(
      matchesFilter("gemini/gemini-embedding-001", [], ["*embed*"])
    ).toBeFalsy();
    expect(matchesFilter("nvidia/embed-qa-4", [], ["*embed*"])).toBeFalsy();
    expect(matchesFilter("nvidia/nv-embed-v1", [], ["*embed*"])).toBeFalsy();
    expect(
      matchesFilter("nvidia/nv-embedqa-e5-v5", [], ["*embed*"])
    ).toBeFalsy();
    expect(
      matchesFilter("nvidia/nv-embedcode-7b-v1", [], ["*embed*"])
    ).toBeFalsy();
  });

  it("filters embed variants with *embed*", () => {
    expect(
      matchesFilter("snowflake/arctic-embed-l", [], ["*embed*"])
    ).toBeFalsy();
    expect(
      matchesFilter("nvidia/llama-nemotron-embed-1b-v2", [], ["*embed*"])
    ).toBeFalsy();
    expect(
      matchesFilter("nvidia/llama-3.2-nv-embedqa-1b-v1", [], ["*embed*"])
    ).toBeFalsy();
  });

  it("filters imagen models with *imagen*", () => {
    expect(
      matchesFilter("gemini/imagen-4.0-generate-001", [], ["*imagen*"])
    ).toBeFalsy();
    expect(
      matchesFilter("gemini/imagen-4.0-ultra-generate-001", [], ["*imagen*"])
    ).toBeFalsy();
    expect(
      matchesFilter("gemini/imagen-4.0-fast-generate-001", [], ["*imagen*"])
    ).toBeFalsy();
  });

  it("filters tts models with *tts*", () => {
    expect(
      matchesFilter("gemini/gemini-2.5-flash-preview-tts", [], ["*tts*"])
    ).toBeFalsy();
    expect(
      matchesFilter("gemini/gemini-2.5-pro-preview-tts", [], ["*tts*"])
    ).toBeFalsy();
    expect(
      matchesFilter("gemini/gemini-3.1-flash-tts-preview", [], ["*tts*"])
    ).toBeFalsy();
  });

  it("include gemini/* filters to only gemini models", () => {
    expect(
      matchesFilter("gemini/gemini-2.5-flash", ["gemini/*"], [])
    ).toBeTruthy();
    expect(
      matchesFilter("gemini/gemini-2.5-pro", ["gemini/*"], [])
    ).toBeTruthy();
    expect(
      matchesFilter("gemini_cli/gemini-2.5-flash", ["gemini/*"], [])
    ).toBeFalsy();
    expect(
      matchesFilter("nvidia/llama-3.3-70b-instruct", ["gemini/*"], [])
    ).toBeFalsy();
  });

  it("include gemini/* with exclude *embed* *imagen* *tts*", () => {
    const include = ["gemini/*"];
    const exclude = ["*embed*", "*imagen*", "*tts*"];

    expect(
      matchesFilter("gemini/gemini-2.5-flash", include, exclude)
    ).toBeTruthy();
    expect(
      matchesFilter("gemini/gemini-2.5-pro", include, exclude)
    ).toBeTruthy();
    expect(
      matchesFilter("gemini/gemini-embedding-001", include, exclude)
    ).toBeFalsy();
    expect(
      matchesFilter("gemini/imagen-4.0-generate-001", include, exclude)
    ).toBeFalsy();
    expect(
      matchesFilter("gemini/gemini-2.5-flash-preview-tts", include, exclude)
    ).toBeFalsy();
  });

  it("handles provider-prefixed model IDs", () => {
    expect(
      matchesFilter("llm-proxy/gemini/gemini-2.5-flash", ["gemini/*"], [])
    ).toBeFalsy();
    expect(
      matchesFilter("nvidianim/nvidia/embed-qa-4", [], ["*embed*"])
    ).toBeFalsy();
  });
});
