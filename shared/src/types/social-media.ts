/**
 * Shared types for social media integration.
 */

export type SocialPlatform = "linkedin" | "instagram" | "gmail";

export type SocialConnection = {
  platform: SocialPlatform;
  accountName: string | null;
  autoPostEnabled: boolean;
  connectedAt: string;
};

export type SocialPostRequest = {
  platform: SocialPlatform;
  content: string;
  imageUrl?: string | null;
};

export type SocialGenerateRequest = {
  platform: SocialPlatform;
  jobTitle: string;
  employer: string;
  jobUrl?: string | null;
  tone?: "excited" | "professional" | "grateful";
  includeHashtags?: boolean;
};

export type SocialGenerateResponse = {
  content: string;
};

export type SocialOAuthStartRequest = {
  platform: SocialPlatform;
  redirectUri: string;
};

export type SocialOAuthStartResponse = {
  url: string;
  connectionId: string;
};

export type SocialOAuthCallbackRequest = {
  platform: SocialPlatform;
  connectionId: string;
};
