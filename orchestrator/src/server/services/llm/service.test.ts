import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeCliClient } from "./claude-cli/client";
import { CodexClient } from "./codex/client";
import { GeminiCliClient } from "./gemini-cli/client";
import { EMPTY_RESPONSE_ERROR } from "./policies/retry-policy";
import { LlmService } from "./service";
import type { JsonSchemaDefinition } from "./types";

const TEST_SCHEMA: JsonSchemaDefinition = {
  name: "test",
  schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
};

function completionResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LlmService provider normalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps legacy localhost openai_compatible configs on LM Studio", () => {
    const llm = new LlmService({
      provider: "openai_compatible",
      baseUrl: "http://localhost:1234",
    });

    expect(llm.getProvider()).toBe("lmstudio");
    expect(llm.getBaseUrl()).toBe("http://localhost:1234");
  });

  it("uses the dedicated provider for non-local OpenAI-compatible endpoints", () => {
    const llm = new LlmService({
      provider: "openai_compatible",
      baseUrl: "https://llm.example.com",
    });

    expect(llm.getProvider()).toBe("openai_compatible");
    expect(llm.getBaseUrl()).toBe("https://llm.example.com");
  });

  it("normalizes the hyphenated openai-compatible alias", () => {
    const llm = new LlmService({
      provider: "openai-compatible",
      baseUrl: "https://llm.example.com",
    });

    expect(llm.getProvider()).toBe("openai_compatible");
    expect(llm.getBaseUrl()).toBe("https://llm.example.com");
  });

  it("supports codex provider normalization", () => {
    const llm = new LlmService({
      provider: "codex",
    });

    expect(llm.getProvider()).toBe("codex");
    expect(llm.getBaseUrl()).toBe("");
  });

  it("supports gemini_cli provider normalization", () => {
    const llm = new LlmService({
      provider: "gemini-cli",
    });

    expect(llm.getProvider()).toBe("gemini_cli");
    expect(llm.getBaseUrl()).toBe("");
  });

  it("supports claude_cli provider normalization", () => {
    const llm = new LlmService({
      provider: "claude-cli",
    });

    expect(llm.getProvider()).toBe("claude_cli");
    expect(llm.getBaseUrl()).toBe("");
  });

  it("supports GLM provider normalization and aliases", () => {
    const glm = new LlmService({
      provider: "glm",
    });
    const zhipu = new LlmService({
      provider: "zhipu-ai",
    });

    expect(glm.getProvider()).toBe("glm");
    expect(glm.getBaseUrl()).toBe("https://api.z.ai/api/paas/v4");
    expect(zhipu.getProvider()).toBe("glm");
  });

  it("supports Anthropic provider normalization and Claude alias", () => {
    const anthropic = new LlmService({
      provider: "anthropic",
    });
    const claude = new LlmService({
      provider: "claude",
    });

    expect(anthropic.getProvider()).toBe("anthropic");
    expect(anthropic.getBaseUrl()).toBe("https://api.anthropic.com");
    expect(claude.getProvider()).toBe("anthropic");
    expect(claude.getBaseUrl()).toBe("https://api.anthropic.com");
  });

  it("ignores stale configured base URLs for native Anthropic", () => {
    const llm = new LlmService({
      provider: "anthropic",
      baseUrl: "https://openrouter.ai",
    });

    expect(llm.getProvider()).toBe("anthropic");
    expect(llm.getBaseUrl()).toBe("https://api.anthropic.com");
  });

  it("retries codex JSON parsing failures and succeeds on a later attempt", async () => {
    const codexCallSpy = vi
      .spyOn(CodexClient.prototype, "callJson")
      .mockResolvedValueOnce({ text: "not-json", turnId: "turn-1" })
      .mockResolvedValueOnce({
        text: '{"value":"ok"}',
        turnId: "turn-2",
      });

    const llm = new LlmService({ provider: "codex" });
    const result = await llm.callJson<{ value: string }>({
      model: "",
      messages: [{ role: "user", content: "Return JSON." }],
      jsonSchema: {
        name: "test",
        schema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
      maxRetries: 1,
      retryDelayMs: 1,
    });

    expect(result).toEqual({ success: true, data: { value: "ok" } });
    expect(codexCallSpy).toHaveBeenCalledTimes(2);
  });

  it("delegates codex credential validation to the codex client", async () => {
    const validateSpy = vi
      .spyOn(CodexClient.prototype, "validateCredentials")
      .mockResolvedValue({ valid: true, message: null });

    const llm = new LlmService({ provider: "codex" });
    const result = await llm.validateCredentials();

    expect(result).toEqual({ valid: true, message: null });
    expect(validateSpy).toHaveBeenCalledOnce();
  });

  it("delegates codex model discovery to the codex client", async () => {
    const listSpy = vi
      .spyOn(CodexClient.prototype, "listModels")
      .mockResolvedValue(["gpt-5", "o4-mini"]);

    const llm = new LlmService({ provider: "codex" });
    const models = await llm.listModels();

    expect(models).toEqual(["gpt-5", "o4-mini"]);
    expect(listSpy).toHaveBeenCalledOnce();
  });

  it("delegates gemini_cli credential validation to the Gemini CLI client", async () => {
    const validateSpy = vi
      .spyOn(GeminiCliClient.prototype, "validateCredentials")
      .mockResolvedValue({ valid: true, message: null });

    const llm = new LlmService({ provider: "gemini_cli" });
    const result = await llm.validateCredentials();

    expect(result).toEqual({ valid: true, message: null });
    expect(validateSpy).toHaveBeenCalledOnce();
  });

  it("returns curated models for gemini_cli", async () => {
    const llm = new LlmService({ provider: "gemini_cli" });
    const models = await llm.listModels();

    expect(models[0]).toBe("google/gemini-3-flash-preview");
    expect(models.length).toBeGreaterThan(1);
  });

  it("delegates claude_cli credential validation to the Claude CLI client", async () => {
    const validateSpy = vi
      .spyOn(ClaudeCliClient.prototype, "validateCredentials")
      .mockResolvedValue({ valid: true, message: null });

    const llm = new LlmService({ provider: "claude_cli" });
    const result = await llm.validateCredentials();

    expect(result).toEqual({ valid: true, message: null });
    expect(validateSpy).toHaveBeenCalledOnce();
  });

  it("returns curated models for claude_cli", async () => {
    const llm = new LlmService({ provider: "claude_cli" });
    const models = await llm.listModels();

    expect(models[0]).toBe("claude-sonnet-5");
    expect(models.length).toBeGreaterThan(1);
  });

  it("retries a 200 response whose completion is empty and succeeds on the next attempt", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(completionResponse(""))
      .mockResolvedValueOnce(completionResponse('{"value":"ok"}'));

    const llm = new LlmService({
      provider: "openrouter",
      apiKey: "sk-or-test",
    });
    const result = await llm.callJson<{ value: string }>({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "Return JSON." }],
      jsonSchema: TEST_SCHEMA,
      maxRetries: 2,
      retryDelayMs: 1,
    });

    expect(result).toEqual({ success: true, data: { value: "ok" } });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("reports the empty completion once the retry budget is exhausted", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => completionResponse(""));

    const llm = new LlmService({
      provider: "openrouter",
      apiKey: "sk-or-test",
    });
    const result = await llm.callJson<{ value: string }>({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "Return JSON." }],
      jsonSchema: TEST_SCHEMA,
      maxRetries: 2,
      retryDelayMs: 1,
    });

    expect(result).toEqual({ success: false, error: EMPTY_RESPONSE_ERROR });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("lists Requesty models from the /models endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "openai/gpt-4o-mini" },
            { id: "anthropic/claude-sonnet-4-5" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const llm = new LlmService({
      provider: "requesty",
      apiKey: "rqsty-sk-test",
    });
    const models = await llm.listModels();

    expect(models).toContain("openai/gpt-4o-mini");
    expect(models).toContain("anthropic/claude-sonnet-4-5");
    const [requestedUrl] = fetchSpy.mock.calls[0] ?? [];
    expect(String(requestedUrl)).toBe("https://router.requesty.ai/v1/models");
  });
});

describe("LlmService model fallback chain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("falls back to the next model when the primary model fails", async () => {
    vi.stubEnv("LLM_FALLBACK_MODELS", "mimo-v2.5");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(completionResponse('{"value":"ok"}'));

    const llm = new LlmService({
      provider: "openai_compatible",
      baseUrl: "https://ai.sumopod.com/v1",
      apiKey: "sk-sumo-test",
    });

    const result = await llm.callJson<{ value: string }>({
      model: "qwen3.7-flash-2026-07-15",
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: TEST_SCHEMA,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe("ok");
    }

    const bodies = fetchSpy.mock.calls.map((call) =>
      String(call[1]?.body ?? ""),
    );
    expect(bodies[0]).toContain("qwen3.7-flash-2026-07-15");
    expect(bodies[1]).toContain("mimo-v2.5");
  });

  it("falls back to a secondary provider when the primary provider fails", async () => {
    vi.stubEnv("LLM_FALLBACK_PROVIDER", "openrouter");
    vi.stubEnv("LLM_FALLBACK_API_KEY", "sk-or-test");
    vi.stubEnv(
      "LLM_FALLBACK_PROVIDER_MODELS",
      "thinkingmachines/inkling:free,thinkingmachines/inkling-small:free",
    );

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("primary down", { status: 503 }))
      .mockResolvedValueOnce(completionResponse('{"value":"fallback-ok"}'));

    const llm = new LlmService({
      provider: "openai_compatible",
      baseUrl: "https://ai.sumopod.com/v1",
      apiKey: "sk-sumo-test",
    });

    const result = await llm.callJson<{ value: string }>({
      model: "qwen3.7-flash-2026-07-15",
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: TEST_SCHEMA,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe("fallback-ok");
    }

    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("ai.sumopod.com");
    expect(urls[1]).toContain("openrouter.ai");
    expect(String(fetchSpy.mock.calls[1]?.[1]?.body)).toContain(
      "thinkingmachines/inkling:free",
    );
  });

  it("returns the last error when every model and fallback provider fails", async () => {
    vi.stubEnv("LLM_FALLBACK_MODELS", "mimo-v2.5");
    vi.stubEnv("LLM_FALLBACK_PROVIDER", "openrouter");
    vi.stubEnv("LLM_FALLBACK_API_KEY", "sk-or-test");
    vi.stubEnv("LLM_FALLBACK_PROVIDER_MODELS", "thinkingmachines/inkling:free");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("all down", { status: 503 }),
    );

    const llm = new LlmService({
      provider: "openai_compatible",
      baseUrl: "https://ai.sumopod.com/v1",
      apiKey: "sk-sumo-test",
    });

    const result = await llm.callJson({
      model: "qwen3.7-flash-2026-07-15",
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: TEST_SCHEMA,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("503");
    }
  });

  it("does not reuse the primary LLM_API_KEY for the fallback provider", () => {
    vi.stubEnv("LLM_API_KEY", "sk-primary-sumopod");
    vi.stubEnv("LLM_FALLBACK_PROVIDER", "openrouter");
    vi.stubEnv("LLM_FALLBACK_PROVIDER_MODELS", "thinkingmachines/inkling:free");

    // No LLM_FALLBACK_API_KEY and no OPENROUTER_API_KEY -> fallback target must
    // be skipped rather than silently authenticating with the SumoPod key.
    const llm = new LlmService({
      provider: "openai_compatible",
      baseUrl: "https://ai.sumopod.com/v1",
    });

    expect(llm.getProvider()).toBe("openai_compatible");
    expect(llm.getBaseUrl()).toBe("https://ai.sumopod.com/v1");
  });
});
