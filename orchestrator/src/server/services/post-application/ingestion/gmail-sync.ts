import { logger } from "@infra/logger";
import { trackServerProductEvent } from "@infra/product-analytics";
import { getAllJobs } from "@server/repositories/jobs";
import {
  getPostApplicationIntegration,
  updatePostApplicationIntegrationSyncState,
  upsertConnectedPostApplicationIntegration,
} from "@server/repositories/post-application-integrations";
import {
  getPostApplicationMessageByExternalId,
  upsertPostApplicationMessage,
} from "@server/repositories/post-application-messages";
import {
  completePostApplicationSyncRun,
  startPostApplicationSyncRun,
} from "@server/repositories/post-application-sync-runs";
import { transitionStage } from "@server/services/applicationTracking";
import { resolveStageTransitionForTarget } from "@server/services/post-application/stage-target";
import { executeComposioTool } from "@server/services/social-media";
import type { PostApplicationRouterStageTarget } from "@shared/types";
import { classifyWithSmartRouter, minifyActiveJobs } from "./email-router";
import type { GmailCredentials } from "./gmail-api";
import {
  buildEmailText,
  buildGmailQuery,
  extractBodyText,
  getMessageFull,
  getMessageMetadata,
  listMessageIds,
  resolveGmailAccessToken,
} from "./gmail-api";

const DEFAULT_SEARCH_DAYS = 90;
const DEFAULT_MAX_MESSAGES = 100;

export type GmailSyncSummary = {
  discovered: number;
  relevant: number;
  classified: number;
  errored: number;
};

export const __test__ = {
  extractBodyText,
  buildEmailText,
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseGmailCredentials(
  credentials: Record<string, unknown> | null,
): GmailCredentials | null {
  if (!credentials) return null;
  const refreshToken = asString(credentials.refreshToken);
  if (!refreshToken) return null;

  const accessToken = asString(credentials.accessToken) ?? undefined;
  const expiryDate =
    typeof credentials.expiryDate === "number" &&
    Number.isFinite(credentials.expiryDate)
      ? credentials.expiryDate
      : undefined;

  return {
    refreshToken,
    accessToken,
    expiryDate,
    scope: asString(credentials.scope) ?? undefined,
    tokenType: asString(credentials.tokenType) ?? undefined,
    email: asString(credentials.email) ?? undefined,
  };
}

function headerValue(
  headers: Array<{ name?: string; value?: string }>,
  name: string,
): string {
  const found = headers.find(
    (header) => (header.name ?? "").toLowerCase() === name.toLowerCase(),
  );
  return String(found?.value ?? "");
}

function parseFromHeader(fromHeader: string): {
  fromAddress: string;
  fromDomain: string | null;
  senderName: string | null;
} {
  const match = fromHeader.match(/^(.*?)<([^>]+)>$/);
  const senderName = match?.[1]?.trim() || null;
  const fromAddress = (match?.[2] || fromHeader).trim().toLowerCase();
  const atIndex = fromAddress.indexOf("@");
  const fromDomain =
    atIndex > 0 ? fromAddress.slice(atIndex + 1).toLowerCase() : null;

  return { fromAddress, fromDomain, senderName };
}

function parseReceivedAt(dateHeader: string): number {
  const parsed = Date.parse(dateHeader);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function resolveProcessingStatus(input: {
  isAutoLinked: boolean;
  isPendingMatch: boolean;
  isRelevantOrphan: boolean;
}): "auto_linked" | "pending_user" | "ignored" {
  if (input.isAutoLinked) return "auto_linked";
  if (input.isPendingMatch || input.isRelevantOrphan) return "pending_user";
  return "ignored";
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

async function createAutoStageEvent(args: {
  jobId: string;
  stageTarget: PostApplicationRouterStageTarget;
  receivedAt: number;
  note: string;
}): Promise<void> {
  void trackServerProductEvent(
    "tracking_email_matched",
    {
      provider: "gmail",
      match_mode: "auto_link",
      stage_target: args.stageTarget,
      result: "success",
    },
    { urlPath: "/tracking-inbox" },
  );

  const transition = resolveStageTransitionForTarget(args.stageTarget);
  if (transition.toStage === "no_change") return;

  const eventLabel =
    args.stageTarget === "applied"
      ? "Email received"
      : `Logged from email: ${args.stageTarget}`;

  transitionStage(
    args.jobId,
    transition.toStage,
    Math.floor(args.receivedAt / 1000),
    {
      actor: "system",
      eventType: "status_update",
      eventLabel,
      note: args.note,
      reasonCode: transition.reasonCode ?? "post_application_auto_linked",
    },
    transition.outcome,
  );
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, concurrency) }).map(
    async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await worker(next);
      }
    },
  );
  await Promise.all(workers);
}

function parseComposioCredentials(
  credentials: Record<string, unknown> | null,
): { composioAccountId: string; email?: string } | null {
  if (!credentials) return null;
  const composioAccountId = asString(credentials.composioAccountId);
  if (!composioAccountId) return null;
  return {
    composioAccountId,
    email: asString(credentials.email) ?? undefined,
  };
}

async function composioGmailFetchEmails(args: {
  connectedAccountId: string;
  searchDays: number;
  maxMessages: number;
}): Promise<Array<{ id: string; threadId: string }>> {
  const query = buildGmailQuery(args.searchDays);
  const result = await executeComposioTool<{
    messages?: Array<{ messageId?: string; threadId?: string; id?: string }>;
    nextPageToken?: string;
  }>({
    toolSlug: "GMAIL_FETCH_EMAILS",
    connectedAccountId: args.connectedAccountId,
    input: {
      query,
      max_results: Math.min(args.maxMessages, 100),
      include_payload: false,
    },
  });
  const rawMessages = result.messages ?? [];
  return rawMessages
    .map((m) => ({
      id: String(m.messageId ?? m.id ?? ""),
      threadId: String(m.threadId ?? ""),
    }))
    .filter((m) => m.id && m.threadId)
    .slice(0, args.maxMessages);
}

async function composioGetGmailMetadata(args: {
  connectedAccountId: string;
  messageId: string;
}): Promise<{
  id: string;
  threadId: string;
  snippet: string;
  headers: Array<{ name?: string; value?: string }>;
}> {
  const result = await executeComposioTool<{
    id?: string;
    threadId?: string;
    snippet?: string;
    payload?: { headers?: Array<{ name?: string; value?: string }> };
    headers?: Array<{ name?: string; value?: string }>;
  }>({
    toolSlug: "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
    connectedAccountId: args.connectedAccountId,
    input: {
      message_id: args.messageId,
      format: "metadata",
    },
  });
  return {
    id: String(result.id ?? args.messageId),
    threadId: String(result.threadId ?? ""),
    snippet: String(result.snippet ?? ""),
    headers: (result.payload?.headers ?? result.headers ?? []) as Array<{
      name?: string;
      value?: string;
    }>,
  };
}

async function composioGetGmailFull(args: {
  connectedAccountId: string;
  messageId: string;
}): Promise<{
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    mimeType?: string;
    body?: { data?: string };
    parts?: Array<{
      mimeType?: string;
      body?: { data?: string };
      parts?: unknown[];
    }>;
  };
}> {
  const result = await executeComposioTool<{
    id?: string;
    threadId?: string;
    snippet?: string;
    payload?: {
      mimeType?: string;
      body?: { data?: string };
      parts?: unknown[];
    };
  }>({
    toolSlug: "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
    connectedAccountId: args.connectedAccountId,
    input: {
      message_id: args.messageId,
      format: "full",
    },
  });
  return {
    id: String(result.id ?? args.messageId),
    threadId: String(result.threadId ?? ""),
    snippet: String(result.snippet ?? ""),
    payload: result.payload as
      | {
          mimeType?: string;
          body?: { data?: string };
          parts?: Array<{
            mimeType?: string;
            body?: { data?: string };
            parts?: unknown[];
          }>;
        }
      | undefined,
  };
}

async function runComposioGmailSync(args: {
  integration: { id: string; displayName?: string | null };
  composioAccountId: string;
  accountKey: string;
  maxMessages?: number;
  searchDays?: number;
}): Promise<GmailSyncSummary> {
  const searchDays = Math.max(1, args.searchDays ?? DEFAULT_SEARCH_DAYS);
  const maxMessages = Math.max(1, args.maxMessages ?? DEFAULT_MAX_MESSAGES);
  const syncRun = await startPostApplicationSyncRun({
    provider: "gmail",
    accountKey: args.accountKey,
    integrationId: args.integration.id,
  });
  let discovered = 0;
  let relevant = 0;
  let classified = 0;
  let matched = 0;
  let errored = 0;
  try {
    const messageIds = await composioGmailFetchEmails({
      connectedAccountId: args.composioAccountId,
      searchDays,
      maxMessages,
    });
    const activeJobs = await getAllJobs([
      "applied",
      "in_progress",
      "processing",
    ]);
    const activeJobMinified = minifyActiveJobs(activeJobs);
    const activeJobIds = new Set(activeJobMinified.map((job) => job.id));
    const concurrency = Math.max(
      1,
      Number.parseInt(
        process.env.POST_APPLICATION_ROUTER_CONCURRENCY ?? "3",
        10,
      ) || 3,
    );
    await runWithConcurrency(messageIds, concurrency, async (message) => {
      discovered += 1;
      try {
        const metadata = await composioGetGmailMetadata({
          connectedAccountId: args.composioAccountId,
          messageId: message.id,
        });
        const from = headerValue(metadata.headers, "From");
        const subject = headerValue(metadata.headers, "Subject");
        const date = headerValue(metadata.headers, "Date");
        const { fromAddress, fromDomain, senderName } = parseFromHeader(from);
        const receivedAt = parseReceivedAt(date);
        const existingMessage = await getPostApplicationMessageByExternalId(
          "gmail",
          args.accountKey,
          metadata.id,
        );
        if (existingMessage) {
          const { message: savedMessage, autoLinkTransitioned } =
            await upsertPostApplicationMessage({
              provider: "gmail",
              accountKey: args.accountKey,
              integrationId: args.integration.id,
              syncRunId: syncRun.id,
              externalMessageId: metadata.id,
              externalThreadId: metadata.threadId,
              fromAddress,
              fromDomain,
              senderName,
              subject,
              receivedAt,
              snippet: metadata.snippet,
              classificationLabel: existingMessage.classificationLabel,
              classificationConfidence:
                existingMessage.classificationConfidence,
              classificationPayload: existingMessage.classificationPayload,
              relevanceLlmScore: existingMessage.relevanceLlmScore,
              relevanceDecision: existingMessage.relevanceDecision,
              matchedJobId: existingMessage.matchedJobId,
              matchConfidence: existingMessage.matchConfidence,
              stageTarget: existingMessage.stageTarget,
              messageType: existingMessage.messageType,
              stageEventPayload: existingMessage.stageEventPayload,
              processingStatus: existingMessage.processingStatus,
              existingMessage,
            });
          if (savedMessage.processingStatus !== "ignored") relevant += 1;
          classified += 1;
          if (savedMessage.matchedJobId) matched += 1;
          if (autoLinkTransitioned && savedMessage.matchedJobId) {
            await createAutoStageEvent({
              jobId: savedMessage.matchedJobId,
              stageTarget: savedMessage.stageTarget ?? "no_change",
              receivedAt: savedMessage.receivedAt,
              note: "Auto-created from Smart Router.",
            });
          }
          return;
        }
        const fullMessage = await composioGetGmailFull({
          connectedAccountId: args.composioAccountId,
          messageId: message.id,
        });
        const body = extractBodyText(fullMessage.payload);
        const emailText = buildEmailText({ from, subject, date, body });
        const routerResult = await classifyWithSmartRouter({
          emailText,
          activeJobs: activeJobMinified,
        });
        const matchedJobId =
          routerResult.bestMatchId && activeJobIds.has(routerResult.bestMatchId)
            ? routerResult.bestMatchId
            : null;
        // Hackathon: force all Composio fetched emails to pending_user so they appear in UI
        const processingStatus: "pending_user" = "pending_user";
        const { message: savedMessage, autoLinkTransitioned } =
          await upsertPostApplicationMessage({
            provider: "gmail",
            accountKey: args.accountKey,
            integrationId: args.integration.id,
            syncRunId: syncRun.id,
            externalMessageId: metadata.id,
            externalThreadId: metadata.threadId,
            fromAddress,
            fromDomain,
            senderName,
            subject,
            receivedAt,
            snippet: metadata.snippet,
            classificationLabel: routerResult.stageTarget,
            classificationConfidence: routerResult.confidence / 100,
            classificationPayload: {
              method: "smart_router",
              reason: routerResult.reason,
              stageTarget: routerResult.stageTarget,
            },
            relevanceLlmScore: 95,
            relevanceDecision: "relevant" as const,
            matchedJobId: matchedJobId,
            matchConfidence: routerResult.confidence,
            stageTarget: routerResult.stageTarget,
            messageType: routerResult.messageType,
            stageEventPayload: routerResult.stageEventPayload,
            processingStatus,
          });
        if (savedMessage.processingStatus !== "ignored") relevant += 1;
        classified += 1;
        if (savedMessage.matchedJobId) matched += 1;
        if (autoLinkTransitioned && savedMessage.matchedJobId) {
          await createAutoStageEvent({
            jobId: savedMessage.matchedJobId,
            stageTarget: savedMessage.stageTarget ?? "no_change",
            receivedAt: savedMessage.receivedAt,
            note: "Auto-created from Smart Router.",
          });
        }
      } catch (error) {
        errored += 1;
        logger.warn("Failed to ingest Gmail message via Composio", {
          provider: "gmail",
          accountKey: args.accountKey,
          externalMessageId: message.id,
          syncRunId: syncRun.id,
          error: normalizeErrorMessage(error),
        });
      }
    });
    await completePostApplicationSyncRun({
      id: syncRun.id,
      status: "completed",
      messagesDiscovered: discovered,
      messagesRelevant: relevant,
      messagesClassified: classified,
      messagesMatched: matched,
      messagesErrored: errored,
    });
    await updatePostApplicationIntegrationSyncState({
      provider: "gmail",
      accountKey: args.accountKey,
      lastSyncedAt: Date.now(),
      lastError: null,
      status: "connected",
    });
    return { discovered, relevant, classified, errored };
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    await completePostApplicationSyncRun({
      id: syncRun.id,
      status: "failed",
      messagesDiscovered: discovered,
      messagesRelevant: relevant,
      messagesClassified: classified,
      messagesMatched: matched,
      messagesErrored: errored,
      errorCode: "GMAIL_SYNC_FAILED",
      errorMessage,
    });
    await updatePostApplicationIntegrationSyncState({
      provider: "gmail",
      accountKey: args.accountKey,
      lastSyncedAt: Date.now(),
      lastError: errorMessage,
      status: "error",
    });
    throw error;
  }
}

export async function runGmailIngestionSync(args: {
  accountKey: string;
  maxMessages?: number;
  searchDays?: number;
}): Promise<GmailSyncSummary> {
  const integration = await getPostApplicationIntegration(
    "gmail",
    args.accountKey,
  );
  if (!integration) {
    throw new Error(`Gmail account '${args.accountKey}' is not connected.`);
  }

  // Composio-managed Gmail account
  const composioCreds = parseComposioCredentials(
    integration.credentials as Record<string, unknown> | null,
  );
  if (composioCreds) {
    return runComposioGmailSync({
      integration,
      composioAccountId: composioCreds.composioAccountId,
      accountKey: args.accountKey,
      searchDays: args.searchDays,
      maxMessages: args.maxMessages,
    });
  }

  const parsedCredentials = parseGmailCredentials(
    integration.credentials as Record<string, unknown> | null,
  );
  if (!parsedCredentials) {
    throw new Error(`Gmail account '${args.accountKey}' is not connected.`);
  }

  const searchDays = Math.max(1, args.searchDays ?? DEFAULT_SEARCH_DAYS);
  const maxMessages = Math.max(1, args.maxMessages ?? DEFAULT_MAX_MESSAGES);

  const syncRun = await startPostApplicationSyncRun({
    provider: "gmail",
    accountKey: args.accountKey,
    integrationId: integration.id,
  });

  let discovered = 0;
  let relevant = 0;
  let classified = 0;
  let matched = 0;
  let errored = 0;

  try {
    const resolvedCredentials =
      await resolveGmailAccessToken(parsedCredentials);
    if (!resolvedCredentials.accessToken) {
      throw new Error("Gmail sync failed to resolve access token.");
    }
    const accessToken = resolvedCredentials.accessToken;

    if (
      resolvedCredentials.accessToken !== parsedCredentials.accessToken ||
      resolvedCredentials.expiryDate !== parsedCredentials.expiryDate
    ) {
      await upsertConnectedPostApplicationIntegration({
        provider: "gmail",
        accountKey: args.accountKey,
        displayName: integration.displayName,
        credentials: {
          refreshToken: resolvedCredentials.refreshToken,
          accessToken: resolvedCredentials.accessToken,
          expiryDate: resolvedCredentials.expiryDate,
          scope: resolvedCredentials.scope,
          tokenType: resolvedCredentials.tokenType,
          email: resolvedCredentials.email,
        },
      });
    }

    const messageIds = await listMessageIds(
      accessToken,
      searchDays,
      maxMessages,
    );
    const activeJobs = await getAllJobs([
      "applied",
      "in_progress",
      "processing",
    ]);
    const activeJobMinified = minifyActiveJobs(activeJobs);
    const activeJobIds = new Set(activeJobMinified.map((job) => job.id));
    const concurrency = Math.max(
      1,
      Number.parseInt(
        process.env.POST_APPLICATION_ROUTER_CONCURRENCY ?? "3",
        10,
      ) || 3,
    );

    await runWithConcurrency(messageIds, concurrency, async (message) => {
      discovered += 1;

      try {
        const metadata = await getMessageMetadata(accessToken, message.id);
        const from = headerValue(metadata.headers, "From");
        const subject = headerValue(metadata.headers, "Subject");
        const date = headerValue(metadata.headers, "Date");
        const { fromAddress, fromDomain, senderName } = parseFromHeader(from);
        const receivedAt = parseReceivedAt(date);
        const existingMessage = await getPostApplicationMessageByExternalId(
          "gmail",
          args.accountKey,
          metadata.id,
        );

        if (existingMessage) {
          const { message: savedMessage, autoLinkTransitioned } =
            await upsertPostApplicationMessage({
              provider: "gmail",
              accountKey: args.accountKey,
              integrationId: integration.id,
              syncRunId: syncRun.id,
              externalMessageId: metadata.id,
              externalThreadId: metadata.threadId,
              fromAddress,
              fromDomain,
              senderName,
              subject,
              receivedAt,
              snippet: metadata.snippet,
              classificationLabel: existingMessage.classificationLabel,
              classificationConfidence:
                existingMessage.classificationConfidence,
              classificationPayload: existingMessage.classificationPayload,
              relevanceLlmScore: existingMessage.relevanceLlmScore,
              relevanceDecision: existingMessage.relevanceDecision,
              matchedJobId: existingMessage.matchedJobId,
              matchConfidence: existingMessage.matchConfidence,
              stageTarget: existingMessage.stageTarget,
              messageType: existingMessage.messageType,
              stageEventPayload: existingMessage.stageEventPayload,
              processingStatus: existingMessage.processingStatus,
              existingMessage,
            });

          if (savedMessage.processingStatus !== "ignored") {
            relevant += 1;
          }
          classified += 1;
          if (savedMessage.matchedJobId) {
            matched += 1;
          }

          if (autoLinkTransitioned && savedMessage.matchedJobId) {
            await createAutoStageEvent({
              jobId: savedMessage.matchedJobId,
              stageTarget: savedMessage.stageTarget ?? "no_change",
              receivedAt: savedMessage.receivedAt,
              note: "Auto-created from Smart Router.",
            });
          }
          return;
        }

        const fullMessage = await getMessageFull(accessToken, message.id);
        const body = extractBodyText(fullMessage.payload);
        const emailText = buildEmailText({
          from,
          subject,
          date,
          body,
        });
        const routerResult = await classifyWithSmartRouter({
          emailText,
          activeJobs: activeJobMinified,
        });

        const matchedJobId =
          routerResult.bestMatchId && activeJobIds.has(routerResult.bestMatchId)
            ? routerResult.bestMatchId
            : null;
        const isAutoLinked = routerResult.confidence >= 95 && matchedJobId;
        const isPendingMatch = routerResult.confidence >= 50;
        const isRelevantOrphan = routerResult.isRelevant;
        const processingStatus = resolveProcessingStatus({
          isAutoLinked: Boolean(isAutoLinked),
          isPendingMatch,
          isRelevantOrphan,
        });

        const { message: savedMessage, autoLinkTransitioned } =
          await upsertPostApplicationMessage({
            provider: "gmail",
            accountKey: args.accountKey,
            integrationId: integration.id,
            syncRunId: syncRun.id,
            externalMessageId: metadata.id,
            externalThreadId: metadata.threadId,
            fromAddress,
            fromDomain,
            senderName,
            subject,
            receivedAt,
            snippet: metadata.snippet,
            classificationLabel: routerResult.stageTarget,
            classificationConfidence: routerResult.confidence / 100,
            classificationPayload: {
              method: "smart_router",
              reason: routerResult.reason,
              stageTarget: routerResult.stageTarget,
            },
            relevanceLlmScore: routerResult.confidence,
            relevanceDecision: routerResult.isRelevant
              ? "relevant"
              : "not_relevant",
            matchedJobId: isAutoLinked || isPendingMatch ? matchedJobId : null,
            matchConfidence: routerResult.confidence,
            stageTarget: routerResult.stageTarget,
            messageType: routerResult.messageType,
            stageEventPayload: routerResult.stageEventPayload,
            processingStatus,
          });

        if (savedMessage.processingStatus !== "ignored") {
          relevant += 1;
        }
        classified += 1;
        if (savedMessage.matchedJobId) {
          matched += 1;
        }

        if (autoLinkTransitioned && savedMessage.matchedJobId) {
          await createAutoStageEvent({
            jobId: savedMessage.matchedJobId,
            stageTarget: savedMessage.stageTarget ?? "no_change",
            receivedAt: savedMessage.receivedAt,
            note: "Auto-created from Smart Router.",
          });
        }
      } catch (error) {
        errored += 1;
        logger.warn("Failed to ingest Gmail message", {
          provider: "gmail",
          accountKey: args.accountKey,
          externalMessageId: message.id,
          syncRunId: syncRun.id,
          error: normalizeErrorMessage(error),
        });
      }
    });

    await completePostApplicationSyncRun({
      id: syncRun.id,
      status: "completed",
      messagesDiscovered: discovered,
      messagesRelevant: relevant,
      messagesClassified: classified,
      messagesMatched: matched,
      messagesErrored: errored,
    });
    await updatePostApplicationIntegrationSyncState({
      provider: "gmail",
      accountKey: args.accountKey,
      lastSyncedAt: Date.now(),
      lastError: null,
      status: "connected",
    });

    return { discovered, relevant, classified, errored };
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    await completePostApplicationSyncRun({
      id: syncRun.id,
      status: "failed",
      messagesDiscovered: discovered,
      messagesRelevant: relevant,
      messagesClassified: classified,
      messagesMatched: matched,
      messagesErrored: errored,
      errorCode: "GMAIL_SYNC_FAILED",
      errorMessage,
    });
    await updatePostApplicationIntegrationSyncState({
      provider: "gmail",
      accountKey: args.accountKey,
      lastSyncedAt: Date.now(),
      lastError: errorMessage,
      status: "error",
    });

    throw error;
  }
}
