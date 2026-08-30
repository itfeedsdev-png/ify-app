import type {
  PersonalBrandContext,
  PersonalBrandPlatform,
  PersonalBrandTone,
  PostPack,
  SwarmResearchResult,
} from "@shared/types/personal-brand";
import { fetchApi } from "./client";

export type GenerateInput = {
  topic: string;
  platforms: PersonalBrandPlatform[];
  tone: PersonalBrandTone;
  customTone?: string;
  researchDepth?: number;
};

export type GenerateOutput = {
  generationId: string;
  context: PersonalBrandContext;
  research: SwarmResearchResult[];
  packs: PostPack[];
};

export async function researchPersonalBrand(): Promise<{
  results: SwarmResearchResult[];
  context: PersonalBrandContext;
}> {
  return fetchApi<{
    results: SwarmResearchResult[];
    context: PersonalBrandContext;
  }>("/personal-brand/research", { method: "POST", body: JSON.stringify({}) });
}

export async function generatePersonalBrand(
  input: GenerateInput,
): Promise<GenerateOutput> {
  return fetchApi<GenerateOutput>("/personal-brand/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listPersonalBrandHistory(limit = 20): Promise<
  Array<{
    id: string;
    topic: string;
    platforms: PersonalBrandPlatform[];
    tone: PersonalBrandTone;
    createdAt: string;
    packs: PostPack[];
  }>
> {
  return fetchApi<
    Array<{
      id: string;
      topic: string;
      platforms: PersonalBrandPlatform[];
      tone: PersonalBrandTone;
      createdAt: string;
      packs: PostPack[];
    }>
  >(`/personal-brand/history?limit=${limit}`);
}

export async function publishPersonalBrand(input: {
  platform: PersonalBrandPlatform;
  content: string;
}): Promise<{ posted: boolean; postUrl?: string }> {
  return fetchApi<{ posted: boolean; postUrl?: string }>(
    "/personal-brand/publish",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
