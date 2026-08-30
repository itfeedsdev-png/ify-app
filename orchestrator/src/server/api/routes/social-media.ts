/**
 * Social media API routes.
 */

import { badRequest } from "@infra/errors";
import { asyncRoute, ok } from "@infra/http";
import {
  disconnectPlatform,
  generateShareContent,
  getConnections,
  getOAuthUrl,
  handleOAuthCallback,
  postToSocial,
  updateAutoPost,
} from "@server/services/social-media";
import { Router } from "express";
import { z } from "zod";

export const socialRouter = Router();

const platformSchema = z.enum(["linkedin", "instagram"]);

socialRouter.get(
  "/connections",
  asyncRoute(async (_req, res) => {
    const connections = await getConnections();
    ok(res, connections);
  }),
);

socialRouter.post(
  "/oauth/start",
  asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        platform: platformSchema,
        redirectUri: z.string().url(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      throw badRequest(
        "Invalid request: platform and redirectUri are required.",
      );
    }

    const { url } = await getOAuthUrl(parsed.data);
    ok(res, { url });
  }),
);

socialRouter.post(
  "/oauth/callback",
  asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        platform: platformSchema,
        connectionId: z.string().min(1),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      throw badRequest(
        "Invalid request: platform and connectionId are required.",
      );
    }

    await handleOAuthCallback(parsed.data);
    ok(res, { connected: true });
  }),
);

socialRouter.delete(
  "/connections/:platform",
  asyncRoute(async (req, res) => {
    const platform = platformSchema.safeParse(req.params.platform);
    if (!platform.success) {
      throw badRequest("Invalid platform. Must be linkedin or instagram.");
    }

    await disconnectPlatform(platform.data);
    ok(res, { disconnected: true });
  }),
);

socialRouter.patch(
  "/connections/:platform/auto-post",
  asyncRoute(async (req, res) => {
    const platform = platformSchema.safeParse(req.params.platform);
    if (!platform.success) {
      throw badRequest("Invalid platform. Must be linkedin or instagram.");
    }

    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request: enabled boolean is required.");
    }

    await updateAutoPost(platform.data, parsed.data.enabled);
    ok(res, { updated: true });
  }),
);

socialRouter.post(
  "/generate",
  asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        platform: platformSchema,
        jobTitle: z.string().min(1),
        employer: z.string().min(1),
        jobUrl: z.string().url().optional().nullable(),
        tone: z.enum(["excited", "professional", "grateful"]).optional(),
        includeHashtags: z.boolean().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      throw badRequest("Invalid request body.");
    }

    const result = await generateShareContent(parsed.data);
    ok(res, result);
  }),
);

socialRouter.post(
  "/post",
  asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        platform: platformSchema,
        content: z.string().min(1).max(5000),
        imageUrl: z.string().url().optional().nullable(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      throw badRequest("Invalid request body.");
    }

    const result = await postToSocial(parsed.data);
    ok(res, result);
  }),
);
