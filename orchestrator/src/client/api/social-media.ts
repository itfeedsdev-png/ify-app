import type {
  SocialConnection,
  SocialGenerateRequest,
  SocialGenerateResponse,
  SocialOAuthStartRequest,
  SocialOAuthStartResponse,
  SocialPostRequest,
} from "@shared/types";
import { fetchApi } from "./client";

export async function listSocialConnections(): Promise<SocialConnection[]> {
  return fetchApi<SocialConnection[]>("/social/connections");
}

export async function startSocialOAuth(
  body: SocialOAuthStartRequest,
): Promise<SocialOAuthStartResponse> {
  return fetchApi<SocialOAuthStartResponse>("/social/oauth/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function completeSocialOAuth(body: {
  platform: "linkedin" | "instagram";
  connectionId: string;
}): Promise<{ connected: boolean }> {
  return fetchApi<{ connected: boolean }>("/social/oauth/callback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function disconnectSocialPlatform(
  platform: "linkedin" | "instagram",
): Promise<{ disconnected: boolean }> {
  return fetchApi<{ disconnected: boolean }>(
    `/social/connections/${platform}`,
    {
      method: "DELETE",
    },
  );
}

export async function setSocialAutoPost(
  platform: "linkedin" | "instagram",
  enabled: boolean,
): Promise<{ updated: boolean }> {
  return fetchApi<{ updated: boolean }>(
    `/social/connections/${platform}/auto-post`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
  );
}

export async function generateSocialContent(
  body: SocialGenerateRequest,
): Promise<SocialGenerateResponse> {
  return fetchApi<SocialGenerateResponse>("/social/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function postToSocial(
  body: SocialPostRequest,
): Promise<{ posted: boolean; postUrl?: string }> {
  return fetchApi<{ posted: boolean; postUrl?: string }>("/social/post", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
