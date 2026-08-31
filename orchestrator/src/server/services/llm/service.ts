import { logger } from "@infra/logger";
import { getOriginalEnvValue } from "@server/services/envSettings";
import { resolveLlmApiKey } from "@server/services/llm/credentials";
import { mapGlmProviderAlias } from "@shared/settings-registry";
import { toStringOrNull } from "@shared/utils/type-conversion";
import { ClaudeCliClient } from "./claude-cli/client";
import { CodexClient } from "./codex/client";
import { GeminiCliClient } from "./gemini-cli/client";
import {
  buildModeCacheKey,
  getOrderedModes,
  rememberSuccessfulMode,
} from "./policies/mode-selection";
import {
  EMPTY_RESPONSE_ERROR,
  getRetryDelayMs,
  parseRetryAfterMs,
  shouldRetryAttempt,
} from "./policies/retry-policy";
import { strategies } from "./providers";
import type {
  JsonSchemaDefinition,
  LlmApiError,
  LlmProvider,
  LlmRequestOptions,
  LlmResponse,
  LlmServiceOptions,
  LlmValidationResult,
  ResponseMode,
} from "./types";
import {
  addQueryParam,
  buildHeaders,
  getResponseDetail,
  joinUrl,
} from "./utils/http";
import { parseJsonContent } from "./utils/json";
import { parseErrorMessage, truncate } from "./utils/string";

type LlmTarget = {
  label: string;
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string | null;
  strategy: (typeof strategies)[LlmProvider];
  /**
   * When set, these models fully replace the requested model. Used by
   * cross-provider fallbacks where the primary model name is not valid
   * (e.g. falling back from SumoPod models to OpenRouter models).
   */
  configuredModels: string[] | null;
  /** Extra models appended after the requested model on the primary target. */
  additionalModels: string[];
};

export class LlmService {
  private readonly provider: LlmProvider;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly strategy: (typeof strategies)[LlmProvider];
  private readonly targets: LlmTarget[];
  private readonly codexClient: CodexClient;
  private readonly geminiCliClient: GeminiCliClient;
  private readonly claudeCliClient: ClaudeCliClient;

  constructor(options: LlmServiceOptions = {}) {
    const normalizedBaseUrl =
      toStringOrNull(options.baseUrl) ||
      toStringOrNull(getOriginalEnvValue("LLM_BASE_URL")) ||
      null;
    const resolvedProvider = normalizeProvider(
      options.provider ?? getOriginalEnvValue("LLM_PROVIDER") ?? null,
      normalizedBaseUrl,
    );

    const strategy = strategies[resolvedProvider];
    const baseUrl = providerUsesConfiguredBaseUrl(resolvedProvider)
      ? normalizedBaseUrl || strategy.defaultBaseUrl
      : strategy.defaultBaseUrl;

    const apiKey = resolveLlmApiKey({
      storedApiKey: options.apiKey,
      provider: resolvedProvider,
    });

    if (
      !toStringOrNull(options.apiKey) &&
      !toStringOrNull(getOriginalEnvValue("LLM_API_KEY")) &&
      resolvedProvider === "openrouter" &&
      apiKey &&
      toStringOrNull(getOriginalEnvValue("OPENROUTER_API_KEY"))
    ) {
      logger.warn(
        "[DEPRECATED] OPENROUTER_API_KEY is deprecated. Use LLM_API_KEY instead; keys are often only shown once.",
      );
    }

    this.provider = resolvedProvider;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.strategy = strategy;
    this.targets = buildLlmTargets({
      provider: resolvedProvider,
      baseUrl,
      apiKey,
      strategy,
    });
    this.codexClient = new CodexClient();
    this.geminiCliClient = new GeminiCliClient();
    this.claudeCliClient = new ClaudeCliClient();
  }

  async callJson<T>(options: LlmRequestOptions<T>): Promise<LlmResponse<T>> {
    if (this.provider === "codex") {
      return this.callCodexJson(options);
    }

    if (this.provider === "gemini_cli") {
      return this.callGeminiCliJson(options);
    }

    if (this.provider === "claude_cli") {
      return this.callClaudeCliJson(options);
    }

    if (this.strategy.requiresApiKey && !this.apiKey) {
      return { success: false, error: "LLM API key not configured" };
    }

    const {
      model,
      messages,
      jsonSchema,
      maxRetries = 0,
      retryDelayMs = 500,
      signal,
    } = options;
    const jobId = options.jobId;

    let lastResult: LlmResponse<T> = {
      success: false,
      error: "All provider modes failed",
    };

    for (
      let targetIndex = 0;
      targetIndex < this.targets.length;
      targetIndex++
    ) {
      const target = this.targets[targetIndex];
      const cacheKey = buildModeCacheKey(target.provider, target.baseUrl);
      const candidateModels = resolveTargetModels({
        target,
        requestedModel: model,
      });

      let targetFailed = false;

      for (
        let modelIndex = 0;
        modelIndex < candidateModels.length;
        modelIndex++
      ) {
        const candidateModel = candidateModels[modelIndex];
        const modes = getOrderedModes(cacheKey, target.strategy.modes);
        let modelFailed = false;

        for (const mode of modes) {
          const result = await this.tryMode<T>({
            target,
            mode,
            model: candidateModel,
            messages,
            jsonSchema,
            maxRetries,
            retryDelayMs,
            jobId,
            signal,
          });

          if (result.success) {
            rememberSuccessfulMode(cacheKey, mode);
            return result;
          }

          if (!result.success && result.error.startsWith("CAPABILITY:")) {
            lastResult = result;
            continue;
          }

          lastResult = result;
          modelFailed = true;
          break;
        }

        const isLastModel = modelIndex === candidateModels.length - 1;
        if (modelFailed && !isLastModel) {
          logger.warn("LLM model failed, falling back to next model", {
            jobId: jobId ?? "unknown",
            target: target.label,
            provider: target.provider,
            failedModel: candidateModel,
            nextModel: candidateModels[modelIndex + 1],
            reason: lastResult.success ? null : lastResult.error,
          });
          continue;
        }

        if (modelFailed) {
          targetFailed = true;
          break;
        }
      }

      const isLastTarget = targetIndex === this.targets.length - 1;
      if (targetFailed && !isLastTarget) {
        logger.warn("LLM target failed, falling back to next provider", {
          jobId: jobId ?? "unknown",
          failedTarget: target.label,
          failedProvider: target.provider,
          nextTarget: this.targets[targetIndex + 1].label,
          nextProvider: this.targets[targetIndex + 1].provider,
          reason: lastResult.success ? null : lastResult.error,
        });
        continue;
      }

      if (targetFailed) {
        return lastResult;
      }
    }

    return lastResult;
  }

  getProvider(): LlmProvider {
    return this.provider;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async validateCredentials(): Promise<LlmValidationResult> {
    if (this.provider === "codex") {
      return this.codexClient.validateCredentials();
    }

    if (this.provider === "gemini_cli") {
      return this.geminiCliClient.validateCredentials();
    }

    if (this.provider === "claude_cli") {
      return this.claudeCliClient.validateCredentials();
    }

    if (this.strategy.requiresApiKey && !this.apiKey) {
      return { valid: false, message: "LLM API key is missing." };
    }

    const urls = this.strategy.getValidationUrls({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
    });
    let lastMessage: string | null = null;

    for (const url of urls) {
      try {
        const validationApiKey =
          this.provider === "gemini" ? null : this.apiKey;
        const response = await fetch(url, {
          method: "GET",
          headers: buildHeaders({
            apiKey: validationApiKey,
            provider: this.provider,
          }),
        });

        if (response.ok) {
          return { valid: true, message: null };
        }

        const detail = await getResponseDetail(response);
        if (response.status === 401 || response.status === 403) {
          return {
            valid: false,
            message: "Invalid LLM API key. Check the key and try again.",
          };
        }
        logger.warn("LLM credential validation request failed", {
          provider: this.provider,
          status: response.status,
          detail: detail || null,
        });

        lastMessage = detail || `LLM provider returned ${response.status}`;
      } catch (error) {
        logger.warn("LLM credential validation request errored", {
          provider: this.provider,
          error: error instanceof Error ? error.message : String(error),
        });
        lastMessage =
          error instanceof Error ? error.message : "LLM validation failed.";
      }
    }

    return {
      valid: false,
      message: lastMessage || "LLM provider validation failed.",
    };
  }

  async listModels(): Promise<string[]> {
    if (this.provider === "codex") {
      return this.codexClient.listModels();
    }

    if (this.provider === "gemini_cli") {
      const models = await this.geminiCliClient.listModels();
      return sortModels(models, getPreferredModel(this.provider));
    }

    if (this.provider === "claude_cli") {
      const models = await this.claudeCliClient.listModels();
      return sortModels(models, getPreferredModel(this.provider));
    }

    if (this.strategy.requiresApiKey && !this.apiKey) {
      throw new Error("LLM API key is missing.");
    }

    if (
      this.provider !== "openai" &&
      this.provider !== "anthropic" &&
      this.provider !== "glm" &&
      this.provider !== "gemini" &&
      this.provider !== "ollama" &&
      this.provider !== "requesty"
    ) {
      return [];
    }

    const models = await (async () => {
      if (this.provider === "openai") {
        return this.listOpenAiModels();
      }
      if (this.provider === "anthropic") {
        return this.listAnthropicModels();
      }
      if (this.provider === "gemini") {
        return this.listGeminiModels();
      }
      if (this.provider === "glm") {
        return this.listGlmModels();
      }
      if (this.provider === "requesty") {
        return this.listRequestyModels();
      }
      return this.listOllamaModels();
    })();

    return sortModels(models, getPreferredModel(this.provider));
  }

  private async callCodexJson<T>(
    options: LlmRequestOptions<T>,
  ): Promise<LlmResponse<T>> {
    const { maxRetries = 0, retryDelayMs = 500, signal, jobId } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info("LLM retry attempt", {
            jobId: jobId ?? "unknown",
            attempt,
            maxRetries,
          });
          await sleep(getRetryDelayMs(retryDelayMs, attempt));
        }

        const result = await this.codexClient.callJson({
          ...options,
          signal,
        });
        const parsed = parseJsonContent<T>(result.text, jobId);
        return { success: true, data: parsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (attempt < maxRetries && shouldRetryAttempt({ message })) {
          logger.warn("Codex attempt failed, retrying", {
            jobId: jobId ?? "unknown",
            attempt: attempt + 1,
            maxRetries,
            message,
          });
          continue;
        }

        return { success: false, error: message };
      }
    }

    return { success: false, error: "All retry attempts failed" };
  }

  private async callGeminiCliJson<T>(
    options: LlmRequestOptions<T>,
  ): Promise<LlmResponse<T>> {
    const { maxRetries = 0, retryDelayMs = 500, signal, jobId } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info("LLM retry attempt", {
            jobId: jobId ?? "unknown",
            attempt,
            maxRetries,
          });
          await sleep(getRetryDelayMs(retryDelayMs, attempt));
        }

        const result = await this.geminiCliClient.callJson({
          ...options,
          signal,
        });
        const parsed = parseJsonContent<T>(result.text, jobId);
        return { success: true, data: parsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (attempt < maxRetries && shouldRetryAttempt({ message })) {
          logger.warn("Gemini CLI attempt failed, retrying", {
            jobId: jobId ?? "unknown",
            attempt: attempt + 1,
            maxRetries,
            message,
          });
          continue;
        }

        return { success: false, error: message };
      }
    }

    return { success: false, error: "All retry attempts failed" };
  }

  private async callClaudeCliJson<T>(
    options: LlmRequestOptions<T>,
  ): Promise<LlmResponse<T>> {
    const { maxRetries = 0, retryDelayMs = 500, signal, jobId } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info("LLM retry attempt", {
            jobId: jobId ?? "unknown",
            attempt,
            maxRetries,
          });
          await sleep(getRetryDelayMs(retryDelayMs, attempt));
        }

        const result = await this.claudeCliClient.callJson({
          ...options,
          signal,
        });
        const parsed = parseJsonContent<T>(result.text, jobId);
        return { success: true, data: parsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (attempt < maxRetries && shouldRetryAttempt({ message })) {
          logger.warn("Claude CLI attempt failed, retrying", {
            jobId: jobId ?? "unknown",
            attempt: attempt + 1,
            maxRetries,
            message,
          });
          continue;
        }

        return { success: false, error: message };
      }
    }

    return { success: false, error: "All retry attempts failed" };
  }

  private async tryMode<T>(args: {
    target: LlmTarget;
    mode: ResponseMode;
    model: string;
    messages: LlmRequestOptions<T>["messages"];
    jsonSchema: JsonSchemaDefinition;
    maxRetries: number;
    retryDelayMs: number;
    jobId?: string;
    signal?: AbortSignal;
  }): Promise<LlmResponse<T>> {
    const {
      target,
      mode,
      model: rawModel,
      messages,
      jsonSchema,
      maxRetries,
      retryDelayMs,
      signal,
    } = args;
    const jobId = args.jobId;
    const model = normalizeModelForProvider(target.provider, rawModel);
    let lastRetryAfterMs: number | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs = getRetryDelayMs(
            retryDelayMs,
            attempt,
            lastRetryAfterMs,
          );
          logger.info("LLM retry attempt", {
            jobId: jobId ?? "unknown",
            attempt,
            maxRetries,
            delayMs,
            retryAfterMs: lastRetryAfterMs ?? "none",
          });
          await sleep(delayMs);
        }

        const { url, headers, body } = target.strategy.buildRequest({
          mode,
          baseUrl: target.baseUrl,
          apiKey: target.apiKey,
          model,
          messages,
          jsonSchema,
        });

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "No error body");
          const parsedError = parseErrorMessage(errorBody);
          const detail = parsedError ? ` - ${truncate(parsedError, 400)}` : "";
          const err = new Error(
            `LLM API error: ${response.status}${detail}`,
          ) as LlmApiError;
          err.status = response.status;
          err.body = truncate(errorBody, 600);
          err.retryAfterMs = parseRetryAfterMs(
            response.headers?.get?.("retry-after"),
          );
          throw err;
        }

        const data = await response.json();
        const content = target.strategy.extractText(data);

        if (!content) {
          throw new Error(EMPTY_RESPONSE_ERROR);
        }

        const parsed = parseJsonContent<T>(content, jobId);
        return { success: true, data: parsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = (error as LlmApiError).status;
        const body = (error as LlmApiError).body;
        lastRetryAfterMs = (error as LlmApiError).retryAfterMs;

        if (
          target.strategy.isCapabilityError({
            mode,
            status,
            body,
          })
        ) {
          return { success: false, error: `CAPABILITY:${message}` };
        }

        if (attempt < maxRetries && shouldRetryAttempt({ message, status })) {
          logger.warn("LLM attempt failed, retrying", {
            jobId: jobId ?? "unknown",
            attempt: attempt + 1,
            maxRetries,
            status: status ?? "no-status",
            message,
          });
          continue;
        }

        return { success: false, error: message };
      }
    }

    return { success: false, error: "All retry attempts failed" };
  }

  private async listOpenAiModels(): Promise<string[]> {
    const response = await fetch(joinUrl(this.baseUrl, "/v1/models"), {
      method: "GET",
      headers: buildHeaders({
        apiKey: this.apiKey,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `OpenAI returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string | null }>;
    };
    return (payload.data ?? [])
      .map((entry) => entry.id?.trim() ?? "")
      .filter(isOpenAiTextGenerationModel)
      .filter(Boolean);
  }

  private async listAnthropicModels(): Promise<string[]> {
    const response = await fetch(joinUrl(this.baseUrl, "/v1/models"), {
      method: "GET",
      headers: buildHeaders({
        apiKey: this.apiKey,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `Anthropic returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string | null }>;
    };
    return (payload.data ?? [])
      .map((entry) => entry.id?.trim() ?? "")
      .filter(isAnthropicTextGenerationModel)
      .filter(Boolean);
  }

  private async listGeminiModels(): Promise<string[]> {
    const url = addQueryParam(
      joinUrl(this.baseUrl, "/v1beta/models"),
      "key",
      this.apiKey ?? "",
    );
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders({
        apiKey: null,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `Gemini returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      models?: Array<{
        name?: string | null;
        supportedGenerationMethods?: string[] | null;
      }>;
    };
    return (payload.models ?? [])
      .filter((entry) =>
        entry.supportedGenerationMethods?.includes("generateContent"),
      )
      .map((entry) => {
        const normalized = normalizeGeminiModelName(entry.name ?? "");
        return normalized ? `google/${normalized}` : "";
      })
      .filter(isGeminiTextGenerationModel)
      .filter(Boolean);
  }

  private async listGlmModels(): Promise<string[]> {
    const base = this.baseUrl.replace(/\/+$/, "");
    const suffix = "/chat/completions";
    const modelsBase = base.endsWith(suffix)
      ? base.slice(0, -suffix.length)
      : base;
    const response = await fetch(joinUrl(modelsBase, "/models"), {
      method: "GET",
      headers: buildHeaders({
        apiKey: this.apiKey,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `GLM returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string | null }>;
    };
    return (payload.data ?? [])
      .map((entry) => entry.id?.trim() ?? "")
      .filter(isGlmTextGenerationModel)
      .filter(Boolean);
  }

  private async listRequestyModels(): Promise<string[]> {
    const response = await fetch(joinUrl(this.baseUrl, "/models"), {
      method: "GET",
      headers: buildHeaders({
        apiKey: this.apiKey,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `Requesty returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string | null }>;
    };
    return (payload.data ?? [])
      .map((entry) => entry.id?.trim() ?? "")
      .filter(Boolean);
  }

  private async listOllamaModels(): Promise<string[]> {
    const response = await fetch(joinUrl(this.baseUrl, "/api/tags"), {
      method: "GET",
      headers: buildHeaders({
        apiKey: null,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `Ollama returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      models?: Array<{ name?: string | null; model?: string | null }>;
    };
    return (payload.models ?? [])
      .map((entry) => entry.name?.trim() || entry.model?.trim() || "")
      .filter(Boolean);
  }
}

function normalizeProvider(
  raw: string | null,
  baseUrl: string | null,
): LlmProvider {
  const normalized = normalizeProviderName(raw);
  if (normalized === "openai_compatible") {
    if (
      baseUrl?.includes("localhost:1234") ||
      baseUrl?.includes("127.0.0.1:1234")
    ) {
      return "lmstudio";
    }
    return "openai_compatible";
  }
  if (normalized === "openai") return "openai";
  if (normalized === "anthropic" || normalized === "claude") {
    return "anthropic";
  }
  if (normalized === "glm") return "glm";
  if (normalized === "gemini") return "gemini";
  if (normalized === "gemini_cli") return "gemini_cli";
  if (normalized === "claude_cli") return "claude_cli";
  if (normalized === "lmstudio") return "lmstudio";
  if (normalized === "ollama") return "ollama";
  if (normalized === "codex") return "codex";
  if (normalized === "requesty") return "requesty";
  if (normalized && normalized !== "openrouter") {
    logger.warn("Unknown LLM provider, defaulting to openrouter", {
      normalized,
    });
  }
  return "openrouter";
}

function normalizeProviderName(raw: string | null): string | undefined {
  const normalized = raw?.trim().toLowerCase().replace(/[-.]/g, "_");
  if (!normalized) return normalized;
  return mapGlmProviderAlias(normalized);
}

function providerUsesConfiguredBaseUrl(provider: LlmProvider): boolean {
  return (
    provider === "lmstudio" ||
    provider === "ollama" ||
    provider === "openai_compatible" ||
    provider === "glm"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseModelList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveTargetModels(args: {
  target: LlmTarget;
  requestedModel: string;
}): string[] {
  const { target, requestedModel } = args;

  if (target.configuredModels && target.configuredModels.length > 0) {
    return Array.from(new Set(target.configuredModels));
  }

  const candidates = [requestedModel, ...target.additionalModels]
    .map((entry) => entry?.trim())
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

function buildLlmTargets(args: {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string | null;
  strategy: (typeof strategies)[LlmProvider];
}): LlmTarget[] {
  const { provider, baseUrl, apiKey, strategy } = args;

  const primaryTarget: LlmTarget = {
    label: "primary",
    provider,
    baseUrl,
    apiKey,
    strategy,
    configuredModels: null,
    additionalModels: parseModelList(
      getOriginalEnvValue("LLM_FALLBACK_MODELS"),
    ),
  };

  const targets: LlmTarget[] = [primaryTarget];

  // Optional cross-provider fallback (e.g. SumoPod -> OpenRouter). Enabled only
  // when both a provider and at least one model are configured.
  const fallbackProviderRaw = getOriginalEnvValue("LLM_FALLBACK_PROVIDER");
  const fallbackModels = parseModelList(
    getOriginalEnvValue("LLM_FALLBACK_PROVIDER_MODELS"),
  );

  if (!fallbackProviderRaw || fallbackModels.length === 0) {
    return targets;
  }

  const fallbackProvider = normalizeProvider(fallbackProviderRaw, null);
  const fallbackStrategy = strategies[fallbackProvider];
  const fallbackBaseUrlRaw = getOriginalEnvValue("LLM_FALLBACK_BASE_URL");
  const fallbackBaseUrl = providerUsesConfiguredBaseUrl(fallbackProvider)
    ? fallbackBaseUrlRaw?.trim() || fallbackStrategy.defaultBaseUrl
    : fallbackStrategy.defaultBaseUrl;

  // Never reuse the primary LLM_API_KEY for the fallback provider: it usually
  // belongs to a different vendor. Prefer LLM_FALLBACK_API_KEY, then the
  // provider-specific env var (e.g. OPENROUTER_API_KEY).
  const fallbackApiKey =
    getOriginalEnvValue("LLM_FALLBACK_API_KEY")?.trim() ||
    (fallbackProvider === "openrouter"
      ? getOriginalEnvValue("OPENROUTER_API_KEY")?.trim() || null
      : null);

  if (fallbackStrategy.requiresApiKey && !fallbackApiKey) {
    logger.warn(
      "LLM fallback provider configured without an API key; skipping fallback target",
      { fallbackProvider },
    );
    return targets;
  }

  targets.push({
    label: "fallback",
    provider: fallbackProvider,
    baseUrl: fallbackBaseUrl,
    apiKey: fallbackApiKey,
    strategy: fallbackStrategy,
    configuredModels: fallbackModels,
    additionalModels: [],
  });

  return targets;
}

function normalizeModelForProvider(
  provider: LlmProvider,
  model: string,
): string {
  if (provider !== "gemini" && provider !== "gemini_cli") return model;
  return normalizeGeminiModelName(model) || model;
}

function normalizeGeminiModelName(value: string): string {
  return value
    .trim()
    .replace(/^models\//, "")
    .replace(/^google\//, "");
}

function getPreferredModel(provider: LlmProvider): string | null {
  if (provider === "openai") return "gpt-5.4-mini";
  if (provider === "anthropic") return "claude-sonnet-4-6";
  if (provider === "glm") return "glm-5.1";
  if (provider === "gemini" || provider === "gemini_cli") {
    return "google/gemini-3-flash-preview";
  }
  if (provider === "claude_cli") return "claude-sonnet-5";
  return null;
}

function isOpenAiTextGenerationModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;

  const blockedPatterns = [
    "audio",
    "embedding",
    "image",
    "moderation",
    "realtime",
    "search",
    "similarity",
    "transcribe",
    "transcription",
    "tts",
    "vision",
    "whisper",
    "computer-use",
    "dall-e",
    "babbage",
    "davinci",
    "omni-moderation",
  ];
  if (blockedPatterns.some((pattern) => normalized.includes(pattern))) {
    return false;
  }

  return /^(gpt|o1|o3|o4|chatgpt|codex)/.test(normalized);
}

function isAnthropicTextGenerationModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith("claude-");
}

function isGeminiTextGenerationModel(model: string): boolean {
  const normalized = normalizeGeminiModelName(model).toLowerCase();
  if (!normalized) return false;
  if (!normalized.startsWith("gemini")) return false;

  const blockedPatterns = ["embedding", "aqa", "vision", "image", "tts"];
  return !blockedPatterns.some((pattern) => normalized.includes(pattern));
}

function isGlmTextGenerationModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;

  const blockedPatterns = [
    "embedding",
    "image",
    "tts",
    "asr",
    "speech",
    "audio",
    "tokenizer",
  ];
  if (blockedPatterns.some((pattern) => normalized.includes(pattern))) {
    return false;
  }

  return normalized.startsWith("glm") || normalized.startsWith("charglm");
}

function sortModels(models: string[], preferredModel: string | null): string[] {
  const unique = Array.from(
    new Set(models.map((model) => model.trim())),
  ).filter(Boolean);
  unique.sort((left, right) => left.localeCompare(right));
  if (!preferredModel) return unique;

  const preferredIndex = unique.indexOf(preferredModel);
  if (preferredIndex <= 0) return unique;

  const [preferred] = unique.splice(preferredIndex, 1);
  return [preferred, ...unique];
}
