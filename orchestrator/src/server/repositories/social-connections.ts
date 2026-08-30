/**
 * Social connections repository - stores OAuth-connected social media accounts.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import {
  getPrivateDataScope,
  privateDataScopeFilter,
} from "../tenancy/private-scope";

const { socialConnections } = schema;

function scopeFilter() {
  return privateDataScopeFilter(socialConnections);
}

export type SocialPlatform = "linkedin" | "instagram";

export type SocialConnectionRow = {
  id: string;
  tenantId: string;
  userId: string;
  platform: SocialPlatform;
  accountId: string;
  accountName: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  autoPostEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function listConnections(): Promise<SocialConnectionRow[]> {
  return db
    .select()
    .from(socialConnections)
    .where(scopeFilter())
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        platform: row.platform as SocialPlatform,
        accountId: row.accountId,
        accountName: row.accountName,
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        expiresAt: row.expiresAt,
        autoPostEnabled: row.autoPostEnabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    );
}

export async function getConnection(
  platform: SocialPlatform,
): Promise<SocialConnectionRow | undefined> {
  const scope = getPrivateDataScope();
  const [row] = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        scopeFilter(),
        eq(socialConnections.platform, platform),
        ...(scope.userId ? [eq(socialConnections.userId, scope.userId)] : []),
      ),
    );
  if (!row) return undefined;
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    platform: row.platform as SocialPlatform,
    accountId: row.accountId,
    accountName: row.accountName,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
    autoPostEnabled: row.autoPostEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertConnection(args: {
  id: string;
  platform: SocialPlatform;
  accountId: string;
  accountName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  autoPostEnabled?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const scope = getPrivateDataScope();

  const existing = await getConnection(args.platform);
  if (existing) {
    await db
      .update(socialConnections)
      .set({
        accountId: args.accountId,
        accountName: args.accountName ?? existing.accountName,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken ?? existing.refreshToken,
        expiresAt: args.expiresAt ?? existing.expiresAt,
        autoPostEnabled: args.autoPostEnabled ?? existing.autoPostEnabled,
        updatedAt: now,
      })
      .where(and(scopeFilter(), eq(socialConnections.platform, args.platform)));
    return;
  }

  await db.insert(socialConnections).values({
    id: args.id,
    tenantId: scope.tenantId,
    userId: scope.userId ?? "",
    platform: args.platform,
    accountId: args.accountId,
    accountName: args.accountName ?? null,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken ?? null,
    expiresAt: args.expiresAt ?? null,
    autoPostEnabled: args.autoPostEnabled ?? false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteConnection(
  platform: SocialPlatform,
): Promise<void> {
  await db
    .delete(socialConnections)
    .where(and(scopeFilter(), eq(socialConnections.platform, platform)));
}

export async function setAutoPost(
  platform: SocialPlatform,
  enabled: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(socialConnections)
    .set({ autoPostEnabled: enabled, updatedAt: now })
    .where(and(scopeFilter(), eq(socialConnections.platform, platform)));
}
