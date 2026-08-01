import { describe, expect, it } from "vitest";

import {
  isValidUrl,
  sanitizeErrorMessage,
  sanitizeModelId,
} from "../src/security";

describe(isValidUrl, () => {
  it("accepts http and https URLs", () => {
    expect(isValidUrl("http://localhost:11434/v1")).toBeTruthy();
    expect(isValidUrl("https://api.openai.com/v1")).toBeTruthy();
  });

  it("rejects unsupported protocols", () => {
    expect(isValidUrl("ftp://example.com")).toBeFalsy();
    expect(isValidUrl("file:///etc/passwd")).toBeFalsy();
  });

  it("rejects malformed URLs", () => {
    expect(isValidUrl("")).toBeFalsy();
    expect(isValidUrl("not a url")).toBeFalsy();
    expect(isValidUrl("localhost:11434")).toBeFalsy();
  });
});

describe(sanitizeModelId, () => {
  it("preserves safe characters", () => {
    expect(sanitizeModelId("qwen/qwen3-32b:latest")).toBe(
      "qwen/qwen3-32b:latest",
    );
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeModelId('my "model" <v2>')).toBe("my__model___v2_");
  });
});

describe(sanitizeErrorMessage, () => {
  it("redacts bearer tokens", () => {
    expect(
      sanitizeErrorMessage(new Error("Unauthorized: Bearer sk-abc12345")),
    ).toBe("Unauthorized: Bearer [REDACTED]");
  });

  it("redacts api key query parameters", () => {
    expect(
      sanitizeErrorMessage("Request failed with api_key=sk-abc12345&retry=1"),
    ).toBe("Request failed with api_key=[REDACTED]&retry=1");
  });

  it("redacts bare sk- keys", () => {
    expect(sanitizeErrorMessage("Invalid key sk-abc12345 supplied")).toBe(
      "Invalid key sk-[REDACTED] supplied",
    );
  });

  it("handles non-Error values", () => {
    expect(sanitizeErrorMessage("plain string")).toBe("plain string");
    expect(sanitizeErrorMessage(42)).toBe("42");
  });

  it("leaves ordinary messages untouched", () => {
    const message = "Failed to discover models from local-ollama";
    expect(sanitizeErrorMessage(new Error(message))).toBe(message);
  });
});
