import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { getAllJobs } from "@server/repositories/jobs";
import { getProfile } from "@server/services/profile";
import type { SwarmResearchResult } from "@shared/types/personal-brand";

export async function researchProfile(): Promise<SwarmResearchResult> {
  const start = Date.now();
  try {
    const [profile, jobs] = await Promise.all([
      getProfile().catch(() => null),
      getAllJobs(["applied", "in_progress", "processing"]).catch(() => []),
    ]);
    const topJobs = jobs.slice(0, 5);
    const p = profile as unknown as {
      displayName?: string;
      username?: string;
      headline?: string;
      skills?: string[];
      summary?: string;
    } | null;
    const skills = p
      ? [
          p.headline ?? "",
          (p.skills ?? []).slice(0, 8).join(", "),
          p.summary ?? "",
        ]
          .filter(Boolean)
          .join(" | ")
      : "";
    const summary = [
      p
        ? `Profile: ${p.displayName ?? p.username} - ${p.headline ?? ""}`
        : "Profile: not set",
      skills ? `Skills: ${skills.slice(0, 300)}` : "",
      topJobs.length
        ? `Recent jobs: ${topJobs
            .map((j) => `${j.title} @ ${j.employer}`)
            .join("; ")
            .slice(0, 400)}`
        : "No recent jobs",
    ]
      .filter(Boolean)
      .join("\n");
    logger.info("Swarm profile agent", {
      requestId: getRequestId(),
      agent: "profile",
      hasProfile: Boolean(profile),
      jobsCount: topJobs.length,
    });
    return {
      agent: "profile",
      source: "profile+resume+jobs",
      summary: summary.slice(0, 800),
      raw: {
        displayName: p?.displayName ?? null,
        headline: p?.headline ?? null,
        topJobs: topJobs.map((j) => ({
          title: j.title,
          employer: j.employer,
        })),
      },
      confidence: p ? "high" : "low",
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      agent: "profile",
      source: "profile",
      summary: "Profile research failed",
      raw: null,
      confidence: "none",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
