/**
 * Social media service - Composio integration for LinkedIn and Instagram posting.
 * Uses Composio v3.1 REST API.
 */

import { AppError, serviceUnavailable } from "@infra/errors";
import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { sanitizeUnknown } from "@infra/sanitize";
import { upsertConnectedPostApplicationIntegration } from "@server/repositories/post-application-integrations";
import {
  deleteConnection,
  getConnection,
  listConnections,
  setAutoPost,
  upsertConnection,
} from "@server/repositories/social-connections";
import { LlmService } from "@server/services/llm/service";
import { getPrivateDataScope } from "@server/tenancy/private-scope";
import { getDefaultModelForProvider } from "@shared/settings-registry";
import type { Job } from "@shared/types";

const COMPOSIO_BASE_URL = "https://backend.composio.dev/api/v3.1";

function getComposioUserId(): string {
  try {
    const scope = getPrivateDataScope();
    if (scope?.tenantId) {
      return `ifyapp-${scope.tenantId}-${scope.userId ?? "anon"}`;
    }
  } catch {
    // outside request scope
  }
  return "ifyapp-default-anon";
}

function getApiKey(): string | null {
  return process.env.COMPOSIO_API_KEY?.trim() || null;
}

function requireApiKey(): string {
  const key = getApiKey();
  if (!key) {
    throw serviceUnavailable(
      "Composio is not configured. Set COMPOSIO_API_KEY in the environment.",
    );
  }
  return key;
}

async function composioFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const apiKey = requireApiKey();
  const url = `${COMPOSIO_BASE_URL}${path}`;
  logger.info("Composio API request", {
    requestId: getRequestId(),
    method: options?.method ?? "GET",
    url,
  });
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  logger.info("Composio API response", {
    requestId: getRequestId(),
    status: response.status,
    bodyPreview: text.slice(0, 500),
  });

  if (!response.ok) {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `Composio API error (${response.status}): ${text}`,
    });
  }

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `Composio API returned non-JSON: ${text.slice(0, 200)}`,
    });
  }
}

export async function getConnections(): Promise<
  Array<{
    platform: string;
    accountName: string | null;
    autoPostEnabled: boolean;
    connectedAt: string;
  }>
> {
  const rows = await listConnections();
  return rows.map((row) => ({
    platform: row.platform,
    accountName: row.accountName,
    autoPostEnabled: row.autoPostEnabled,
    connectedAt: row.createdAt,
  }));
}

export async function generateShareContent(args: {
  platform: "linkedin" | "instagram" | "gmail";
  jobTitle: string;
  employer: string;
  jobUrl?: string | null;
  tone?: "excited" | "professional" | "grateful";
  includeHashtags?: boolean;
}): Promise<{ content: string }> {
  if (args.platform === "gmail") {
    throw new AppError({
      code: "INVALID_REQUEST",
      message: "Gmail does not support share content generation.",
    });
  }
  const llm = new LlmService();
  const defaultModel = getDefaultModelForProvider(llm.getProvider());
  const tone = args.tone ?? "professional";
  const includeHashtags = args.includeHashtags ?? true;

  const platformGuidance =
    args.platform === "linkedin"
      ? "LinkedIn post (150-300 words). Professional tone, can include a call-to-action."
      : "Instagram caption (short, punchy, emoji-friendly). Max 150 words.";

  const systemPrompt = `You are a social media content writer for job seekers. Write an authentic ${args.platform} post announcing that the user has just applied to a role.

Guidelines:
- ${platformGuidance}
- Tone: ${tone}
- Mention the company name and role title naturally.
- Do NOT include the job application URL directly (use text like "just applied to ${args.employer}").
- ${includeHashtags ? "Include 3-5 relevant hashtags at the end." : "Do NOT include hashtags."}
- Keep it genuine, not overly salesy.`;

  const userPrompt = `Company: ${args.employer}\nRole: ${args.jobTitle}`;

  const result = await llm.callJson({
    model: defaultModel || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    jsonSchema: {
      name: "social_post",
      schema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The generated social media post text",
          },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  });

  if (!result.success) {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `Failed to generate social content: ${result.error}`,
    });
  }

  const parsed = result.data as { content?: string };
  if (!parsed.content) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "LLM returned empty content for social post.",
    });
  }

  return { content: parsed.content.trim() };
}

export async function postToSocial(args: {
  platform: "linkedin" | "instagram" | "gmail";
  content: string;
  imageUrl?: string | null;
}): Promise<{ posted: boolean; postUrl?: string }> {
  if (args.platform === "gmail") {
    throw new AppError({
      code: "INVALID_REQUEST",
      message: "Gmail does not support social posting.",
    });
  }
  const connection = await getConnection(args.platform);
  if (!connection) {
    throw new AppError({
      code: "NOT_FOUND",
      message: `No connected ${args.platform} account found. Connect your account in Settings first.`,
    });
  }

  const toolSlug =
    args.platform === "linkedin"
      ? "LINKEDIN_CREATE_TEXT_POST"
      : "INSTAGRAM_CREATE_TEXT_POST";

  try {
    const userId = await resolveComposioUserId(connection.accountId);
    const result = await composioFetch<{
      data?: { postUrl?: string };
    }>(`/tools/execute/${toolSlug}`, {
      method: "POST",
      body: JSON.stringify({
        connected_account_id: connection.accountId,
        user_id: userId,
        arguments: { text: args.content, caption: args.content },
      }),
    });

    logger.info("Social post published", {
      requestId: getRequestId(),
      accountId: connection.accountId,
      platform: args.platform,
    });

    return {
      posted: true,
      postUrl: result?.data?.postUrl,
    };
  } catch (error) {
    logger.error("Social post failed", {
      requestId: getRequestId(),
      platform: args.platform,
      error: sanitizeUnknown(error),
    });
    throw serviceUnavailable(
      `Failed to post to ${args.platform}. Please check your connection and try again.`,
    );
  }
}

export async function autoPostOnApplied(job: Job): Promise<void> {
  const connections = await listConnections();
  for (const conn of connections) {
    if (!conn.autoPostEnabled) continue;
    try {
      const { content } = await generateShareContent({
        platform: conn.platform,
        jobTitle: job.title,
        employer: job.employer,
        tone: "grateful",
      });
      await postToSocial({
        platform: conn.platform,
        content,
      });
    } catch (error) {
      logger.warn("Auto-post skipped", {
        requestId: getRequestId(),
        platform: conn.platform,
        jobId: job.id,
        error: sanitizeUnknown(error),
      });
    }
  }
}

export async function disconnectPlatform(
  platform: "linkedin" | "instagram" | "gmail",
): Promise<void> {
  if (platform === "gmail") {
    throw new AppError({
      code: "INVALID_REQUEST",
      message: "Use post-application provider disconnect for Gmail.",
    });
  }
  const connection = await getConnection(platform);
  if (!connection) {
    throw new AppError({
      code: "NOT_FOUND",
      message: `No connected ${platform} account found.`,
    });
  }

  const apiKey = getApiKey();
  if (apiKey) {
    try {
      await composioFetch(`/connected_accounts/${connection.accountId}`, {
        method: "DELETE",
      });
    } catch (error) {
      logger.warn("Composio disconnect failed, proceeding anyway", {
        requestId: getRequestId(),
        platform,
        error: sanitizeUnknown(error),
      });
    }
  }

  await deleteConnection(platform);
}

export async function updateAutoPost(
  platform: "linkedin" | "instagram" | "gmail",
  enabled: boolean,
): Promise<void> {
  if (platform === "gmail") {
    throw new AppError({
      code: "INVALID_REQUEST",
      message: "Gmail does not support auto-post.",
    });
  }
  await setAutoPost(platform, enabled);
}

export async function getOAuthUrl(args: {
  platform: "linkedin" | "instagram" | "gmail";
  redirectUri: string;
}): Promise<{ url: string; connectionId: string }> {
  requireApiKey();

  // Find auth config by toolkit slug (v3.1 terminology)
  let authConfigId: string | undefined;
  try {
    const configs = await composioFetch<{
      items?: Array<{ id: string; toolkit?: { slug: string } }>;
    }>(`/auth_configs?toolkit_slug=${args.platform}`);
    authConfigId = configs?.items?.[0]?.id;
  } catch (error) {
    logger.warn("Failed to list Composio auth configs", {
      platform: args.platform,
      error: sanitizeUnknown(error),
    });
  }

  // Fallback: env
  if (!authConfigId) {
    authConfigId =
      args.platform === "linkedin"
        ? process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID?.trim()
        : args.platform === "instagram"
          ? process.env.COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID?.trim()
          : process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID?.trim();
  }

  logger.info("Composio OAuth start", {
    platform: args.platform,
    authConfigId,
    hasLinkedinEnv: !!process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID,
  });

  if (!authConfigId) {
    throw new AppError({
      code: "SERVICE_UNAVAILABLE",
      message: `No Composio auth config found for ${args.platform}. Please set up the integration in your Composio dashboard.`,
    });
  }

  try {
    const raw = await composioFetch<Record<string, unknown>>(
      "/connected_accounts",
      {
        method: "POST",
        body: JSON.stringify({
          auth_config: {
            id: authConfigId,
          },
          connection: {
            user_id: getComposioUserId(),
            callback_url: args.redirectUri,
          },
        }),
      },
    );

    logger.info("Composio connected_accounts raw response", {
      requestId: getRequestId(),
      raw: sanitizeUnknown(raw),
    });

    // Handle multiple possible response shapes
    const redirectUrl =
      (raw.redirect_url as string | undefined) ??
      (raw.redirectUrl as string | undefined) ??
      "";

    let connectionId =
      (raw.id as string | undefined) ??
      (raw.connected_account_id as string | undefined) ??
      (raw._id as string | undefined) ??
      "";

    // Sometimes the response is wrapped under "data"
    if (!connectionId && typeof raw.data === "object" && raw.data !== null) {
      const data = raw.data as Record<string, unknown>;
      connectionId =
        (data.id as string | undefined) ??
        (data.connected_account_id as string | undefined) ??
        (data._id as string | undefined) ??
        "";
    }

    if (!redirectUrl) {
      throw new AppError({
        code: "UPSTREAM_ERROR",
        message: "Composio did not return a redirect URL",
      });
    }
    if (!connectionId) {
      throw new AppError({
        code: "UPSTREAM_ERROR",
        message: "Composio did not return a connection ID",
      });
    }
    return { url: redirectUrl, connectionId };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    logger.error("Composio connected_accounts creation failed", {
      requestId: getRequestId(),
      platform: args.platform,
      authConfigId,
      error: sanitizeUnknown(error),
    });
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `Composio connection failed: ${rawMessage}`,
    });
  }
}

export async function handleOAuthCallback(args: {
  platform: "linkedin" | "instagram" | "gmail";
  connectionId: string;
}): Promise<void> {
  requireApiKey();

  const connectedAccount = await composioFetch<{
    status: string;
    id: string;
    user_id?: string;
    member_info?: { email?: string };
  }>(`/connected_accounts/${args.connectionId}`);

  if (connectedAccount.status !== "ACTIVE") {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `OAuth connection to ${args.platform} is not active yet. Status: ${connectedAccount.status}`,
    });
  }

  if (args.platform === "gmail") {
    await upsertConnectedPostApplicationIntegration({
      provider: "gmail",
      accountKey: "default",
      displayName: connectedAccount.member_info?.email ?? "Gmail",
      credentials: {
        composioAccountId: connectedAccount.id,
        email: connectedAccount.member_info?.email,
      },
    });
    return;
  }

  await upsertConnection({
    id: connectedAccount.id,
    platform: args.platform,
    accountId: connectedAccount.user_id ?? "",
    accountName: connectedAccount.member_info?.email ?? null,
    accessToken: "composio-managed",
    autoPostEnabled: false,
  });
}

async function resolveComposioUserId(
  connectedAccountId: string,
): Promise<string> {
  try {
    const acc = await composioFetch<{
      user_id?: string;
      userId?: string;
    }>(`/connected_accounts/${connectedAccountId}`);
    return acc.user_id ?? acc.userId ?? getComposioUserId();
  } catch {
    return getComposioUserId();
  }
}

export async function executeComposioTool<T>(args: {
  toolSlug: string;
  connectedAccountId: string;
  input: Record<string, unknown>;
}): Promise<T> {
  requireApiKey();
  const userId = await resolveComposioUserId(args.connectedAccountId);

  const result = await composioFetch<{
    data?: T;
    error?: string;
    successful?: boolean;
  }>(`/tools/execute/${args.toolSlug}`, {
    method: "POST",
    body: JSON.stringify({
      connected_account_id: args.connectedAccountId,
      user_id: userId,
      arguments: args.input,
    }),
  });

  if (!result.successful) {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `Composio tool ${args.toolSlug} failed: ${result.error ?? "Unknown error"}`,
    });
  }

  return result.data as T;
}
