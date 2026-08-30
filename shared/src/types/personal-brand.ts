export const PERSONAL_BRAND_PLATFORMS = [
  "linkedin",
  "instagram",
  "github",
] as const;
export type PersonalBrandPlatform = (typeof PERSONAL_BRAND_PLATFORMS)[number];

export const PERSONAL_BRAND_TONES = [
  "professional",
  "storytelling",
  "technical",
  "casual",
  "custom",
] as const;
export type PersonalBrandTone = (typeof PERSONAL_BRAND_TONES)[number];

export const SWARM_AGENT_NAMES = [
  "profile",
  "github",
  "linkedin",
  "instagram",
] as const;
export type SwarmAgentName = (typeof SWARM_AGENT_NAMES)[number];

export type SwarmResearchResult = {
  agent: SwarmAgentName;
  source: string;
  summary: string;
  raw: unknown;
  confidence: "high" | "low" | "none";
  latencyMs: number;
  error?: string;
};

export type PersonalBrandContext = {
  profile: string;
  github: string;
  linkedin: string;
  instagram: string;
  topSkills: string[];
  recentActivity: string;
};

export type PostPackVariant = {
  id: string;
  content: string;
  hashtags: string[];
  cta?: string;
};

export type PostPack = {
  platform: PersonalBrandPlatform;
  content: string;
  hashtags: string[];
  cta?: string;
  variants: PostPackVariant[];
};

export type SwarmGenerateRequest = {
  topic: string;
  platforms: PersonalBrandPlatform[];
  tone: PersonalBrandTone;
  customTone?: string;
  researchDepth?: number;
};

export type SwarmGenerateResponse = {
  packs: PostPack[];
  research: SwarmResearchResult[];
  context: PersonalBrandContext;
  generationId: string;
};

export type PostGenerationRecord = {
  id: string;
  tenantId: string;
  userId: string | null;
  topic: string;
  platforms: PersonalBrandPlatform[];
  tone: PersonalBrandTone;
  customTone?: string | null;
  researchContext: PersonalBrandContext;
  packs: PostPack[];
  research: SwarmResearchResult[];
  createdAt: string;
};
