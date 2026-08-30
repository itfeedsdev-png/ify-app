import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { getConnection } from "@server/repositories/social-connections";
import { executeComposioTool } from "@server/services/social-media";
import type { SwarmResearchResult } from "@shared/types/personal-brand";

export async function researchInstagram(): Promise<SwarmResearchResult> {
  const start = Date.now();
  try {
    const connection = await getConnection("instagram").catch(() => null);
    if (!connection) {
      return {
        agent: "instagram",
        source: "instagram",
        summary: "Instagram: not connected — research skipped",
        raw: null,
        confidence: "none",
        latencyMs: Date.now() - start,
      };
    }
    try {
      const data = await executeComposioTool<{
        media?: Array<{ caption?: string }>;
      }>({
        toolSlug: "INSTAGRAM_GET_USER_MEDIA",
        connectedAccountId: connection.accountId,
        input: { limit: 2 },
      });
      const captions =
        (data as unknown as { media?: Array<{ caption?: string }> })?.media
          ?.map((m) => m.caption)
          .filter(Boolean)
          .slice(0, 2)
          .join(" | ") ?? "";
      const summary = captions
        ? `Recent IG captions: ${captions.slice(0, 300)}`
        : "Instagram: connected, no recent captions";
      logger.info("Swarm instagram agent", {
        requestId: getRequestId(),
        agent: "instagram",
        hasData: Boolean(data),
      });
      return {
        agent: "instagram",
        source: "instagram",
        summary: summary.slice(0, 600),
        raw: data,
        confidence: captions ? "high" : "low",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        agent: "instagram",
        source: "instagram",
        summary: "Instagram: connected but fetch failed",
        raw: { accountName: connection.accountName },
        confidence: "low",
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    return {
      agent: "instagram",
      source: "instagram",
      summary: "Instagram research failed",
      raw: null,
      confidence: "none",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
