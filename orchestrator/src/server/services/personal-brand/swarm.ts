import { randomUUID } from "node:crypto";
import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { sanitizeUnknown } from "@infra/sanitize";
import { db, schema } from "@server/db";
import { LlmService } from "@server/services/llm/service";
import { getPrivateDataScope } from "@server/tenancy/private-scope";
import { getDefaultModelForProvider } from "@shared/settings-registry";
import type {
  PersonalBrandContext,
  PersonalBrandPlatform,
  PersonalBrandTone,
  PostPack,
  SwarmResearchResult,
} from "@shared/types/personal-brand";
import { runResearchSwarm } from "./research";

function sanitizeForPrompt(value: string, maxLen: number): string {
  return value
    .replace(/[^\x20-\x7E\n]/g, "")
    .slice(0, maxLen)
    .trim();
}

function buildSynthesizedPrompt(
  context: PersonalBrandContext,
  topic: string,
): string {
  return `Synthesize personal brand context for topic "${sanitizeForPrompt(topic, 120)}".
Profile: ${sanitizeForPrompt(context.profile, 500)}
GitHub: ${sanitizeForPrompt(context.github, 300)}
LinkedIn: ${sanitizeForPrompt(context.linkedin, 300)}
Instagram: ${sanitizeForPrompt(context.instagram, 300)}
Top skills: ${context.topSkills.join(", ").slice(0, 200)}
Return JSON: { "audience": string, "angle": string, "keyPoints": string[] }`;
}

function buildGeneratePrompt(
  context: PersonalBrandContext,
  synthesized: string,
  topic: string,
  platform: PersonalBrandPlatform,
  tone: PersonalBrandTone,
  customTone?: string,
): string {
  const toneHint =
    tone === "custom" && customTone ? sanitizeForPrompt(customTone, 120) : tone;
  const limits: Record<PersonalBrandPlatform, string> = {
    linkedin: "150-300 words, professional, hashtags 3-5",
    instagram: "max 150 words, emoji-friendly, punchy",
    github: "README-style, markdown allowed, technical",
  };
  return `Write a ${platform} post. Tone: ${toneHint}. Limits: ${limits[platform]}.
Topic: ${sanitizeForPrompt(topic, 200)}
Synthesized context: ${sanitizeForPrompt(synthesized, 600)}
Brand context: ${sanitizeForPrompt(context.profile, 300)}
Do NOT include PII beyond what is given. Return JSON: { "content": string, "hashtags": string[], "cta": string }`;
}

function buildCritiquePrompt(pack: PostPack): string {
  return `Critique this ${pack.platform} post for brand consistency, length, tone. Content: ${sanitizeForPrompt(pack.content, 600)}
Return JSON: { "content": string, "issues": string[] } where content is fixed version if needed, else same.`;
}

export async function runPersonalBrandSwarm(args: {
  topic: string;
  platforms: PersonalBrandPlatform[];
  tone: PersonalBrandTone;
  customTone?: string;
}): Promise<{
  generationId: string;
  context: PersonalBrandContext;
  research: SwarmResearchResult[];
  packs: PostPack[];
}> {
  const requestId = getRequestId();
  const scope = getPrivateDataScope();
  const llm = new LlmService();
  const model = getDefaultModelForProvider(llm.getProvider()) || "gpt-4o-mini";

  logger.info("Personal brand swarm start", {
    requestId,
    tenantId: scope.tenantId,
    topic: sanitizeForPrompt(args.topic, 80),
    platforms: args.platforms,
    tone: args.tone,
  });

  const { results: research, context } = await runResearchSwarm();

  // Synthesize
  let synthesized = `Audience: general; Angle: ${args.topic}`;
  try {
    const res = await llm.callJson({
      model,
      messages: [
        {
          role: "system",
          content: "You are a personal brand synthesizer. Return JSON only.",
        },
        { role: "user", content: buildSynthesizedPrompt(context, args.topic) },
      ],
      jsonSchema: {
        name: "synthesize",
        schema: {
          type: "object",
          properties: {
            audience: { type: "string" },
            angle: { type: "string" },
            keyPoints: { type: "array", items: { type: "string" } },
          },
          required: ["audience", "angle", "keyPoints"],
          additionalProperties: false,
        },
      },
    });
    if (res.success) {
      const data = res.data as {
        audience: string;
        angle: string;
        keyPoints: string[];
      };
      synthesized = `Audience: ${data.audience}; Angle: ${data.angle}; Points: ${data.keyPoints.join("; ")}`;
    }
  } catch (error) {
    logger.warn("Synthesize failed, using fallback", {
      requestId,
      error: sanitizeUnknown(error),
    });
  }

  // Mock mode for testing: topic contains [mock] or env flag
  const isMock =
    process.env.IFYAPP_MOCK_PERSONAL_BRAND === "true" ||
    args.topic.toLowerCase().includes("[mock]");

  // Generate per platform in parallel
  const packPromises = args.platforms.map(async (platform) => {
    if (isMock) {
      const mockContent: Record<PersonalBrandPlatform, string> = {
        linkedin: `Thrilled to share: ${args.topic.replace("[mock]", "").trim()}\n\nSwarm synthesized 4 agents (profile • github • linkedin • ig) → angle: ${synthesized.slice(0, 80)}. Tone: ${args.tone}. Built with ify app personal brand swarm. What’s your take?`,
        instagram: `Behind the scenes ✨\n${args.topic.replace("[mock]", "").trim()}\nSwarm: profile • github • linkedin • ig → pack in one click. Tone ${args.tone} — which version do you prefer?`,
        github: `# ${args.topic.replace("[mock]", "").trim()}\n\n> Swarm-generated — Tone: ${args.tone}\n\n- Research: profile + repos + social\n- Stack: ify app + Composio + OpenRouter\n- Next: ship, learn, iterate`,
      };
      const mockHashtags: Record<PersonalBrandPlatform, string[]> = {
        linkedin: ["#buildinpublic", "#personalbranding", "#engineering"],
        instagram: ["#buildinpublic", "#behindthescenes"],
        github: ["#opensource"],
      };
      return {
        platform,
        content: mockContent[platform],
        hashtags: mockHashtags[platform],
        cta: platform === "linkedin" ? "Let’s connect — DM open" : undefined,
        variants: [
          {
            id: randomUUID(),
            content: mockContent[platform],
            hashtags: mockHashtags[platform],
            cta:
              platform === "linkedin" ? "Let’s connect — DM open" : undefined,
          },
          {
            id: randomUUID(),
            content: `${mockContent[platform]}\n\nVariant 2 — shorter hook.`,
            hashtags: mockHashtags[platform].slice(0, 2),
          },
        ],
      } as PostPack;
    }
    try {
      const res = await llm.callJson({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a personal branding content writer. Return JSON only.",
          },
          {
            role: "user",
            content: buildGeneratePrompt(
              context,
              synthesized,
              args.topic,
              platform,
              args.tone,
              args.customTone,
            ),
          },
        ],
        jsonSchema: {
          name: "post_pack",
          schema: {
            type: "object",
            properties: {
              content: { type: "string" },
              hashtags: { type: "array", items: { type: "string" } },
              cta: { type: "string" },
            },
            required: ["content", "hashtags"],
            additionalProperties: false,
          },
        },
      });
      if (!res.success) throw new Error(res.error);
      const data = res.data as {
        content: string;
        hashtags: string[];
        cta?: string;
      };
      const base: PostPack = {
        platform,
        content: sanitizeForPrompt(data.content, 4000),
        hashtags: (data.hashtags ?? [])
          .slice(0, 5)
          .map((h) => sanitizeForPrompt(h, 30)),
        cta: data.cta ? sanitizeForPrompt(data.cta, 120) : undefined,
        variants: [
          {
            id: randomUUID(),
            content: sanitizeForPrompt(data.content, 4000),
            hashtags: (data.hashtags ?? []).slice(0, 5),
            cta: data.cta,
          },
        ],
      };
      // Critic pass
      try {
        const critique = await llm.callJson({
          model,
          messages: [
            {
              role: "system",
              content: "You are a brand critic. Return JSON only.",
            },
            { role: "user", content: buildCritiquePrompt(base) },
          ],
          jsonSchema: {
            name: "critique",
            schema: {
              type: "object",
              properties: {
                content: { type: "string" },
                issues: { type: "array", items: { type: "string" } },
              },
              required: ["content", "issues"],
              additionalProperties: false,
            },
          },
        });
        if (critique.success) {
          const c = critique.data as { content: string; issues: string[] };
          if (c.content && c.content !== base.content) {
            base.content = sanitizeForPrompt(c.content, 4000);
            base.variants[0].content = base.content;
          }
        }
      } catch {
        // ignore critic failure
      }
      return base;
    } catch (error) {
      logger.warn("Generate failed for platform", {
        requestId,
        platform,
        error: sanitizeUnknown(error),
      });
      return {
        platform,
        content: `Draft for ${args.topic} on ${platform} — ${args.tone} tone (fallback, LLM failed)`,
        hashtags: ["#personalbranding"],
        variants: [],
      } as PostPack;
    }
  });

  const packs = await Promise.all(packPromises);

  const generationId = randomUUID();
  const now = new Date().toISOString();
  await db.insert(schema.postGenerations).values({
    id: generationId,
    tenantId: scope.tenantId,
    userId: scope.userId ?? null,
    topic: args.topic,
    platforms: args.platforms as unknown as string,
    tone: args.tone,
    customTone: args.customTone ?? null,
    researchContext: context as unknown as string,
    packs: packs as unknown as string,
    research: research as unknown as string,
    createdAt: now,
    updatedAt: now,
  });

  logger.info("Personal brand swarm done", {
    requestId,
    generationId,
    packsCount: packs.length,
  });

  return { generationId, context, research, packs };
}

export async function listGenerations(limit = 20): Promise<
  Array<{
    id: string;
    topic: string;
    platforms: PersonalBrandPlatform[];
    tone: PersonalBrandTone;
    createdAt: string;
    packs: PostPack[];
  }>
> {
  const scope = getPrivateDataScope();
  const rows = await db
    .select()
    .from(schema.postGenerations)
    .orderBy(schema.postGenerations.createdAt)
    .limit(100);
  const scoped = rows.filter((r) => r.tenantId === scope.tenantId);
  if (scope.userId) {
    const userScoped = scoped.filter(
      (r) => !r.userId || r.userId === scope.userId,
    );
    return userScoped
      .slice(-limit)
      .reverse()
      .map((r) => ({
        id: r.id,
        topic: r.topic,
        platforms: (r.platforms as unknown as PersonalBrandPlatform[]) ?? [],
        tone: r.tone as PersonalBrandTone,
        createdAt: r.createdAt,
        packs: (r.packs as unknown as PostPack[]) ?? [],
      }));
  }
  return scoped
    .slice(-limit)
    .reverse()
    .map((r) => ({
      id: r.id,
      topic: r.topic,
      platforms: (r.platforms as unknown as PersonalBrandPlatform[]) ?? [],
      tone: r.tone as PersonalBrandTone,
      createdAt: r.createdAt,
      packs: (r.packs as unknown as PostPack[]) ?? [],
    }));
}
