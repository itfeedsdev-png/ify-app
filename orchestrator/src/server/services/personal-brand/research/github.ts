import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { getConnection } from "@server/repositories/social-connections";
import { getProfile } from "@server/services/profile";
import { executeComposioTool } from "@server/services/social-media";
import type { SwarmResearchResult } from "@shared/types/personal-brand";

async function fetchViaComposio(
  connectedAccountId: string,
): Promise<{ summary: string; raw: unknown } | null> {
  try {
    const data = await executeComposioTool<{
      repos?: Array<{ name?: string; description?: string }>;
      data?: unknown;
    }>({
      toolSlug: "GITHUB_LIST_REPOS",
      connectedAccountId,
      input: { per_page: 3 },
    });
    const repos =
      (data as unknown as { repos?: Array<{ name: string }> })?.repos ?? [];
    if (!repos.length) return null;
    const summary = `GitHub repos: ${repos
      .slice(0, 3)
      .map((r) => r.name)
      .join(", ")}`;
    return { summary, raw: repos.slice(0, 3) };
  } catch {
    return null;
  }
}

async function fetchViaPublicApi(
  username: string,
): Promise<{ summary: string; raw: unknown } | null> {
  try {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=3&sort=updated`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const repos = (await res.json()) as Array<{
      name: string;
      description: string | null;
    }>;
    if (!Array.isArray(repos) || repos.length === 0) return null;
    return {
      summary: `GitHub repos: ${repos.map((r) => r.name).join(", ")}`,
      raw: repos
        .map((r) => ({ name: r.name, description: r.description }))
        .slice(0, 3),
    };
  } catch {
    return null;
  }
}

export async function researchGithub(): Promise<SwarmResearchResult> {
  const start = Date.now();
  try {
    const connection = await getConnection(
      "github" as unknown as "linkedin",
    ).catch(() => null);
    // SocialPlatform doesn't include github, so try generic lookup
    let summary = "";
    let raw: unknown = null;
    let confidence: SwarmResearchResult["confidence"] = "low";

    if (connection) {
      const via = await fetchViaComposio(connection.accountId);
      if (via) {
        summary = via.summary;
        raw = via.raw;
        confidence = "high";
      }
    }
    if (!summary) {
      const profile = await getProfile().catch(() => null);
      const p = profile as unknown as {
        githubUsername?: string;
        displayName?: string;
      } | null;
      const username =
        p?.githubUsername ?? (p?.displayName ?? "").split(" ")[0];
      if (username) {
        const viaPublic = await fetchViaPublicApi(username);
        if (viaPublic) {
          summary = viaPublic.summary;
          raw = viaPublic.raw;
          confidence = "low";
        }
      }
    }
    if (!summary) {
      summary = "GitHub: not connected or no repos found";
      confidence = "none";
    }
    logger.info("Swarm github agent", {
      requestId: getRequestId(),
      agent: "github",
      confidence,
    });
    return {
      agent: "github",
      source: "github",
      summary: summary.slice(0, 600),
      raw,
      confidence,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      agent: "github",
      source: "github",
      summary: "GitHub research failed",
      raw: null,
      confidence: "none",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
