import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import type {
  PersonalBrandContext,
  SwarmResearchResult,
} from "@shared/types/personal-brand";
import { researchGithub } from "./github";
import { researchInstagram } from "./instagram";
import { researchLinkedin } from "./linkedin";
import { researchProfile } from "./profile";

const AGENT_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Agent timeout after ${ms}ms`)), ms),
    ),
  ]);
}

export async function runResearchSwarm(): Promise<{
  results: SwarmResearchResult[];
  context: PersonalBrandContext;
}> {
  const requestId = getRequestId();
  logger.info("Swarm research start", {
    requestId,
    agents: ["profile", "github", "linkedin", "instagram"],
  });

  const settled = await Promise.allSettled([
    withTimeout(researchProfile(), AGENT_TIMEOUT_MS),
    withTimeout(researchGithub(), AGENT_TIMEOUT_MS),
    withTimeout(researchLinkedin(), AGENT_TIMEOUT_MS),
    withTimeout(researchInstagram(), AGENT_TIMEOUT_MS),
  ]);

  const results: SwarmResearchResult[] = settled.map((s, idx) => {
    const names: SwarmResearchResult["agent"][] = [
      "profile",
      "github",
      "linkedin",
      "instagram",
    ];
    if (s.status === "fulfilled") return s.value;
    return {
      agent: names[idx],
      source: names[idx],
      summary: `${names[idx]} agent timeout/error`,
      raw: null,
      confidence: "none" as const,
      latencyMs: AGENT_TIMEOUT_MS,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });

  for (const r of results) {
    logger.info("Swarm agent done", {
      requestId,
      agent: r.agent,
      confidence: r.confidence,
      latencyMs: r.latencyMs,
      hasError: Boolean(r.error),
    });
  }

  const byAgent = Object.fromEntries(
    results.map((r) => [r.agent, r]),
  ) as Record<SwarmResearchResult["agent"], SwarmResearchResult>;

  const profileSummary = byAgent.profile.summary;
  const topSkills =
    profileSummary
      .split("Skills:")[1]
      ?.split("\n")[0]
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8) ?? [];

  const context: PersonalBrandContext = {
    profile: byAgent.profile.summary.slice(0, 800),
    github: byAgent.github.summary.slice(0, 600),
    linkedin: byAgent.linkedin.summary.slice(0, 600),
    instagram: byAgent.instagram.summary.slice(0, 600),
    topSkills,
    recentActivity: [
      byAgent.github.summary,
      byAgent.linkedin.summary,
      byAgent.instagram.summary,
    ]
      .filter((s) => !s.includes("not connected"))
      .join(" | ")
      .slice(0, 600),
  };

  logger.info("Swarm research done", {
    requestId,
    contextSkills: topSkills.length,
  });

  return { results, context };
}
