import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { getConnection } from "@server/repositories/social-connections";
import { executeComposioTool } from "@server/services/social-media";
import type { SwarmResearchResult } from "@shared/types/personal-brand";

export async function researchLinkedin(): Promise<SwarmResearchResult> {
  const start = Date.now();
  try {
    const connection = await getConnection("linkedin").catch(() => null);
    if (!connection) {
      return {
        agent: "linkedin",
        source: "linkedin",
        summary: "LinkedIn: not connected — research skipped",
        raw: null,
        confidence: "none",
        latencyMs: Date.now() - start,
      };
    }
    try {
      const data = await executeComposioTool<{
        headline?: string;
        summary?: string;
        profile?: unknown;
      }>({
        toolSlug: "LINKEDIN_GET_PROFILE",
        connectedAccountId: connection.accountId,
        input: {},
      });
      const summary = [
        (data as unknown as { headline?: string })?.headline
          ? `Headline: ${(data as unknown as { headline: string }).headline}`
          : "",
        "LinkedIn profile fetched via Composio",
      ]
        .filter(Boolean)
        .join(" | ");
      logger.info("Swarm linkedin agent", {
        requestId: getRequestId(),
        agent: "linkedin",
        hasData: Boolean(data),
      });
      return {
        agent: "linkedin",
        source: "linkedin",
        summary: summary.slice(0, 600) || "LinkedIn: connected",
        raw: data,
        confidence: "high",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        agent: "linkedin",
        source: "linkedin",
        summary: "LinkedIn: connected but fetch failed — using account name",
        raw: { accountName: connection.accountName },
        confidence: "low",
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    return {
      agent: "linkedin",
      source: "linkedin",
      summary: "LinkedIn research failed",
      raw: null,
      confidence: "none",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
