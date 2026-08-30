/**
 * OAuth routes for Google and GitHub sign-in.
 *
 * Flow:
 *   1. GET  /api/auth/oauth/:provider/start   → redirect to provider
 *   2. GET  /api/auth/oauth/:provider/callback → exchange code, upsert user, issue JWT
 *
 * Env vars required:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 */

import { AppError, badRequest, serviceUnavailable } from "@infra/errors";
import { asyncRoute, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { sanitizeUnknown } from "@infra/sanitize";
import { signToken } from "@server/auth/jwt";
import * as usersRepo from "@server/repositories/users";
import { Router } from "express";
import { z } from "zod";

export const oauthRouter = Router();

type OAuthProvider = "google" | "github";

const PROVIDER_CONFIG: Record<
  OAuthProvider,
  {
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
    clientIdEnv: string;
    clientSecretEnv: string;
  }
> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scopes: ["openid", "email", "profile"],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: ["read:user", "user:email"],
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
};

function getProviderConfig(provider: OAuthProvider) {
  return PROVIDER_CONFIG[provider];
}

function getClientId(provider: OAuthProvider): string | null {
  return process.env[PROVIDER_CONFIG[provider].clientIdEnv]?.trim() || null;
}

function getClientSecret(provider: OAuthProvider): string | null {
  return process.env[PROVIDER_CONFIG[provider].clientSecretEnv]?.trim() || null;
}

function isProviderConfigured(provider: OAuthProvider): boolean {
  return Boolean(getClientId(provider) && getClientSecret(provider));
}

function getPublicBaseUrl(_req: import("express").Request): string | null {
  const envBase =
    process.env.IFYAPP_PUBLIC_BASE_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    null;
  if (envBase) return envBase.replace(/\/$/, "");
  return null;
}

function buildCallbackUri(
  req: import("express").Request,
  provider: OAuthProvider,
): string {
  const publicBase = getPublicBaseUrl(req);
  if (publicBase) {
    return `${publicBase}/api/auth/oauth/${provider}/callback`;
  }
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host =
    req.headers["x-forwarded-host"] || req.get("host") || "localhost";
  return `${proto}://${host}/api/auth/oauth/${provider}/callback`;
}

function buildSignInRedirect(
  req: import("express").Request,
  query: string,
): string {
  const publicBase = getPublicBaseUrl(req);
  if (publicBase) {
    return `${publicBase}/sign-in${query}`;
  }
  // In dev, backend is :3001 and frontend is :5173 — redirect to frontend
  const host = req.get("host") || "localhost:3001";
  const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
  const effectiveHost = forwardedHost || host;
  // If request came through Vite proxy (host is :5173), keep it; if direct to :3001, map to :5173 in dev
  const isDev = process.env.NODE_ENV !== "production";
  let frontendHost = effectiveHost;
  if (isDev && effectiveHost.includes(":3001")) {
    frontendHost = effectiveHost.replace(":3001", ":5173");
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  return `${proto}://${frontendHost}/sign-in${query}`;
}

/** GET /api/auth/oauth/:provider/start */
oauthRouter.get(
  "/:provider/start",
  asyncRoute(async (req, res) => {
    const provider = z
      .enum(["google", "github"])
      .safeParse(req.params.provider);
    if (!provider.success) {
      throw badRequest("Unknown OAuth provider");
    }

    if (!isProviderConfigured(provider.data)) {
      throw serviceUnavailable(
        `${provider.data} OAuth is not configured. Set ${PROVIDER_CONFIG[provider.data].clientIdEnv} and ${PROVIDER_CONFIG[provider.data].clientSecretEnv}.`,
      );
    }

    const config = getProviderConfig(provider.data);
    const redirectUri = buildCallbackUri(req, provider.data);
    const state = Buffer.from(
      JSON.stringify({ provider: provider.data, ts: Date.now() }),
    ).toString("base64url");

    const params = new URLSearchParams({
      client_id: getClientId(provider.data) as string,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      state,
      ...(provider.data === "google" ? { access_type: "online" } : {}),
    });

    res.redirect(`${config.authUrl}?${params.toString()}`);
  }),
);

/** GET /api/auth/oauth/:provider/callback */
oauthRouter.get(
  "/:provider/callback",
  asyncRoute(async (req, res) => {
    const provider = z
      .enum(["google", "github"])
      .safeParse(req.params.provider);
    if (!provider.success) {
      res.redirect(buildSignInRedirect(req, "?error=unknown_provider"));
      return;
    }

    const { code, error: oauthError } = req.query as Record<string, string>;

    if (oauthError || !code) {
      logger.warn("OAuth callback denied or missing code", {
        requestId: getRequestId(),
        provider: provider.data,
        error: oauthError,
      });
      res.redirect(buildSignInRedirect(req, "?error=oauth_denied"));
      return;
    }

    if (!isProviderConfigured(provider.data)) {
      res.redirect(buildSignInRedirect(req, "?error=not_configured"));
      return;
    }

    try {
      const redirectUri = buildCallbackUri(req, provider.data);
      const profile = await exchangeAndFetchProfile(
        provider.data,
        code,
        redirectUri,
      );

      const user = await usersRepo.findOrCreateOAuthUser({
        provider: provider.data,
        providerAccountId: profile.id,
        email: profile.email,
        displayName: profile.name ?? profile.login ?? profile.email ?? null,
      });

      const { token, expiresIn } = await signToken({
        sub: user.id,
        userId: user.id,
        tenantId: user.workspaceId,
        username: user.username,
        isSystemAdmin: user.isSystemAdmin,
      });

      logger.info("OAuth sign-in successful", {
        requestId: getRequestId(),
        provider: provider.data,
        userId: user.id,
      });

      // Redirect to the client with the token in a short-lived fragment
      res.redirect(
        buildSignInRedirect(
          req,
          `?oauth_token=${encodeURIComponent(token)}&oauth_expires_in=${expiresIn}`,
        ),
      );
    } catch (error) {
      logger.error("OAuth callback failed", {
        requestId: getRequestId(),
        provider: provider.data,
        error: sanitizeUnknown(error),
      });
      res.redirect(buildSignInRedirect(req, "?error=oauth_failed"));
    }
  }),
);

/** GET /api/auth/oauth/providers — list which providers are configured */
oauthRouter.get(
  "/providers",
  asyncRoute(async (_req, res) => {
    ok(res, {
      google: isProviderConfigured("google"),
      github: isProviderConfigured("github"),
    });
  }),
);

// ─── Provider exchange helpers ──────────────────────────────────────────────

type OAuthProfile = {
  id: string;
  email: string | null;
  name?: string | null;
  login?: string | null; // GitHub username
};

async function exchangeAndFetchProfile(
  provider: OAuthProvider,
  code: string,
  redirectUri: string,
): Promise<OAuthProfile> {
  const config = getProviderConfig(provider);
  const clientId = getClientId(provider) as string;
  const clientSecret = getClientSecret(provider) as string;

  // Exchange code for access token
  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `${provider} token exchange failed (${tokenRes.status})`,
    });
  }

  const tokenData = (await tokenRes.json()) as Record<string, unknown>;
  const accessToken = tokenData.access_token as string | undefined;
  if (!accessToken) {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `${provider} did not return an access token`,
    });
  }

  // Fetch user profile
  const profileRes = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(provider === "github" ? { "User-Agent": "ify-app" } : {}),
    },
  });

  if (!profileRes.ok) {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: `${provider} user info fetch failed (${profileRes.status})`,
    });
  }

  const profile = (await profileRes.json()) as Record<string, unknown>;

  if (provider === "google") {
    const sub = profile.sub as string | undefined;
    const email = (profile.email as string | undefined) ?? null;
    const name = (profile.name as string | undefined) ?? null;
    if (!sub) {
      throw new AppError({
        code: "UPSTREAM_ERROR",
        message: "Google profile missing sub",
      });
    }
    return { id: sub, email, name };
  }

  // GitHub
  const ghId = String(profile.id ?? "");
  if (!ghId || ghId === "undefined") {
    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: "GitHub profile missing id",
    });
  }
  const ghEmail = (profile.email as string | undefined) ?? null;
  const ghLogin = (profile.login as string | undefined) ?? null;
  const ghName = (profile.name as string | undefined) ?? ghLogin;

  // GitHub may return null email; fetch from /user/emails endpoint
  let resolvedEmail = ghEmail;
  if (!resolvedEmail) {
    try {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": "ify-app",
        },
      });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        const primary = emails.find((e) => e.primary && e.verified);
        resolvedEmail = primary?.email ?? emails[0]?.email ?? null;
      }
    } catch {
      // Non-critical — continue without email
    }
  }

  return { id: ghId, email: resolvedEmail, name: ghName, login: ghLogin };
}
