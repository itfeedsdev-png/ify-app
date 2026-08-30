import { badRequest } from "@infra/errors";
import { asyncRoute, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { getConnection } from "@server/repositories/social-connections";
import { runResearchSwarm } from "@server/services/personal-brand/research";
import {
  listGenerations,
  runPersonalBrandSwarm,
} from "@server/services/personal-brand/swarm";
import {
  PERSONAL_BRAND_PLATFORMS,
  PERSONAL_BRAND_TONES,
} from "@shared/types/personal-brand";
import { Router } from "express";
import { z } from "zod";

export const personalBrandRouter = Router();

const generateSchema = z.object({
  topic: z.string().min(3).max(500),
  platforms: z.array(z.enum(PERSONAL_BRAND_PLATFORMS)).min(1).max(3),
  tone: z.enum(PERSONAL_BRAND_TONES),
  customTone: z.string().max(200).optional(),
  researchDepth: z.number().int().min(1).max(5).optional(),
});

const publishSchema = z.object({
  platform: z.enum(PERSONAL_BRAND_PLATFORMS),
  content: z.string().min(1).max(5000),
});

personalBrandRouter.post(
  "/research",
  asyncRoute(async (_req, res) => {
    const requestId = getRequestId();
    logger.info("Personal brand research", { requestId });
    const { results, context } = await runResearchSwarm();
    ok(res, { results, context });
  }),
);

personalBrandRouter.post(
  "/generate",
  asyncRoute(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid generate payload", parsed.error.flatten());
    }
    const { topic, platforms, tone, customTone } = parsed.data;
    const result = await runPersonalBrandSwarm({
      topic,
      platforms,
      tone,
      customTone,
    });
    ok(res, result);
  }),
);

personalBrandRouter.get(
  "/history",
  asyncRoute(async (req, res) => {
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const items = await listGenerations(limit);
    ok(res, items);
  }),
);

personalBrandRouter.post(
  "/publish",
  asyncRoute(async (req, res) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid publish payload", parsed.error.flatten());
    }
    const { platform, content } = parsed.data;

    const isMock =
      process.env.IFYAPP_MOCK_PERSONAL_BRAND === "true" ||
      content.toLowerCase().includes("[mock]") ||
      content.includes("test swarm");
    if (isMock) {
      logger.info("Personal brand publish (mock)", {
        requestId: getRequestId(),
        platform,
      });
      ok(res, {
        posted: true,
        postUrl: `https://mock.${platform}.com/post/${Date.now()}`,
      });
      return;
    }

    const socialPlatform =
      platform === "github" ? null : (platform as "linkedin" | "instagram");
    if (!socialPlatform) {
      throw badRequest("GitHub publish via Composio not yet supported");
    }

    const connection = await getConnection(socialPlatform).catch(() => null);
    if (!connection) {
      throw badRequest(
        `No connected ${platform} account. Connect in Post → Connect.`,
      );
    }

    try {
      const { postToSocial } = await import("@server/services/social-media");
      const result = await postToSocial({
        platform: socialPlatform,
        content,
      });
      logger.info("Personal brand publish", {
        requestId: getRequestId(),
        platform,
        accountId: connection.accountId,
      });
      ok(res, { posted: true, postUrl: result.postUrl });
    } catch (error) {
      logger.error("Personal brand publish failed", {
        requestId: getRequestId(),
        platform,
        error: String(error),
      });
      throw badRequest(
        `Failed to publish to ${platform}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }),
);
