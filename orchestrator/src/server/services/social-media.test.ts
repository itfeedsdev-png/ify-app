/**
 * Unit tests for social-media.ts service.
 * Composio HTTP calls are intercepted so no real API key is needed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock repository layer ───────────────────────────────────────────────────
vi.mock("@server/repositories/social-connections", () => ({
  listConnections: vi.fn().mockResolvedValue([]),
  getConnection: vi.fn().mockResolvedValue(undefined),
  upsertConnection: vi.fn().mockResolvedValue(undefined),
  deleteConnection: vi.fn().mockResolvedValue(undefined),
  setAutoPost: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock LLM service ────────────────────────────────────────────────────────
const mockCallJson = vi.fn().mockResolvedValue({
  success: true,
  data: { content: "Thrilled to share I just applied to Acme!" },
});

vi.mock("@server/services/llm/service", () => {
  class LlmService {
    getProvider() {
      return "openai";
    }
    callJson(...args: unknown[]) {
      return mockCallJson(...args);
    }
  }
  return { LlmService };
});

vi.mock("@shared/settings-registry", () => ({
  getDefaultModelForProvider: vi.fn().mockReturnValue("gpt-4o-mini"),
}));

vi.mock("@infra/request-context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@infra/request-context")>();
  return {
    ...actual,
    getRequestId: vi.fn().mockReturnValue("test-request-id"),
  };
});

vi.mock("@server/tenancy/private-scope", () => ({
  getPrivateDataScope: vi.fn().mockReturnValue({
    tenantId: "tenant_default",
    userId: "test-user",
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

describe("social-media service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, COMPOSIO_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─── getConnections ─────────────────────────────────────────────────────
  describe("getConnections", () => {
    it("maps repository rows to public shape", async () => {
      const { listConnections } = await import(
        "@server/repositories/social-connections"
      );
      vi.mocked(listConnections).mockResolvedValueOnce([
        {
          id: "row-1",
          tenantId: "t1",
          userId: "u1",
          platform: "linkedin",
          accountId: "acc-1",
          accountName: "Alice",
          accessToken: "composio-managed",
          refreshToken: null,
          expiresAt: null,
          autoPostEnabled: true,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);

      const { getConnections } = await import("@server/services/social-media");
      const result = await getConnections();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        platform: "linkedin",
        accountName: "Alice",
        autoPostEnabled: true,
        connectedAt: "2024-01-01T00:00:00.000Z",
      });
      // Tokens must NOT be exposed
      expect(JSON.stringify(result)).not.toContain("composio-managed");
    });
  });

  // ─── generateShareContent ──────────────────────────────────────────────
  describe("generateShareContent", () => {
    it("calls LLM and returns trimmed content", async () => {
      const { generateShareContent } = await import(
        "@server/services/social-media"
      );
      const result = await generateShareContent({
        platform: "linkedin",
        jobTitle: "Senior Engineer",
        employer: "Acme",
      });

      expect(result.content).toBe("Thrilled to share I just applied to Acme!");
    });

    it("throws when LLM returns an error", async () => {
      mockCallJson.mockResolvedValueOnce({
        success: false,
        error: "token_limit",
      });

      const { generateShareContent } = await import(
        "@server/services/social-media"
      );
      await expect(
        generateShareContent({
          platform: "instagram",
          jobTitle: "Designer",
          employer: "Widgets Inc",
        }),
      ).rejects.toThrow("Failed to generate social content");
    });
  });

  // ─── getOAuthUrl ────────────────────────────────────────────────────────
  describe("getOAuthUrl", () => {
    it("returns the composio redirect URL", async () => {
      let callCount = 0;
      globalThis.fetch = vi
        .fn()
        .mockImplementation(async (url: string, init?: RequestInit) => {
          callCount++;
          if (callCount === 1) {
            // GET /auth_configs?toolkit_slug=linkedin
            return {
              ok: true,
              text: async () =>
                JSON.stringify({
                  items: [{ id: "int-1", toolkit: { slug: "linkedin" } }],
                }),
              json: async () => ({
                items: [{ id: "int-1", toolkit: { slug: "linkedin" } }],
              }),
            } as unknown as Response;
          }
          // POST /connected_accounts
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          expect(body.auth_config?.id).toBe("int-1");
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                redirect_url: "https://composio.dev/oauth?token=xyz",
                id: "conn-abc",
              }),
            json: async () => ({
              redirect_url: "https://composio.dev/oauth?token=xyz",
              id: "conn-abc",
            }),
          } as unknown as Response;
        }) as typeof fetch;

      const { getOAuthUrl } = await import("@server/services/social-media");
      const result = await getOAuthUrl({
        platform: "linkedin",
        redirectUri: "https://myapp.com/settings",
      });

      expect(result.url).toBe("https://composio.dev/oauth?token=xyz");
      expect(result.connectionId).toBe("conn-abc");
    });

    it("throws SERVICE_UNAVAILABLE when no integration is found", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          text: async () => JSON.stringify({ items: [] }),
          json: async () => ({ items: [] }),
        } as unknown as Response;
      }) as typeof fetch;

      const { getOAuthUrl } = await import("@server/services/social-media");
      await expect(
        getOAuthUrl({
          platform: "instagram",
          redirectUri: "https://myapp.com/settings",
        }),
      ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    });
  });

  // ─── handleOAuthCallback ────────────────────────────────────────────────
  describe("handleOAuthCallback", () => {
    it("persists connection when Composio status is ACTIVE", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toContain("/connected_accounts/conn-123");
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              status: "ACTIVE",
              id: "conn-123",
              user_id: "entity-abc",
              member_info: { email: "alice@example.com" },
            }),
          json: async () => ({
            status: "ACTIVE",
            id: "conn-123",
            user_id: "entity-abc",
            member_info: { email: "alice@example.com" },
          }),
        } as unknown as Response;
      }) as typeof fetch;

      const { upsertConnection } = await import(
        "@server/repositories/social-connections"
      );

      const { handleOAuthCallback } = await import(
        "@server/services/social-media"
      );
      await handleOAuthCallback({
        platform: "linkedin",
        connectionId: "conn-123",
      });

      expect(upsertConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "conn-123",
          platform: "linkedin",
          accountId: "entity-abc",
          accountName: "alice@example.com",
        }),
      );
    });

    it("throws UPSTREAM_ERROR when status is not ACTIVE", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "PENDING",
            id: "conn-456",
            user_id: "entity-def",
          }),
        json: async () => ({
          status: "PENDING",
          id: "conn-456",
          user_id: "entity-def",
        }),
      } as unknown as Response);

      const { handleOAuthCallback } = await import(
        "@server/services/social-media"
      );
      await expect(
        handleOAuthCallback({
          platform: "instagram",
          connectionId: "conn-456",
        }),
      ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
    });
  });

  // ─── disconnectPlatform ─────────────────────────────────────────────────
  describe("disconnectPlatform", () => {
    it("throws NOT_FOUND when no connection exists", async () => {
      const { getConnection } = await import(
        "@server/repositories/social-connections"
      );
      vi.mocked(getConnection).mockResolvedValueOnce(undefined);

      const { disconnectPlatform } = await import(
        "@server/services/social-media"
      );
      await expect(disconnectPlatform("linkedin")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("calls Composio DELETE and removes DB row", async () => {
      const { getConnection, deleteConnection } = await import(
        "@server/repositories/social-connections"
      );
      vi.mocked(getConnection).mockResolvedValueOnce({
        id: "row-1",
        tenantId: "t1",
        userId: "u1",
        platform: "linkedin",
        accountId: "acc-1",
        accountName: null,
        accessToken: "composio-managed",
        refreshToken: null,
        expiresAt: null,
        autoPostEnabled: false,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }) as typeof fetch;

      const { disconnectPlatform } = await import(
        "@server/services/social-media"
      );
      await disconnectPlatform("linkedin");

      expect(deleteConnection).toHaveBeenCalledWith("linkedin");
    });
  });

  // ─── autoPostOnApplied ──────────────────────────────────────────────────
  describe("autoPostOnApplied", () => {
    it("skips platforms with autoPostEnabled=false", async () => {
      const { listConnections } = await import(
        "@server/repositories/social-connections"
      );
      vi.mocked(listConnections).mockResolvedValueOnce([
        {
          id: "row-1",
          tenantId: "t1",
          userId: "u1",
          platform: "linkedin",
          accountId: "acc-1",
          accountName: null,
          accessToken: "composio-managed",
          refreshToken: null,
          expiresAt: null,
          autoPostEnabled: false,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);

      const { autoPostOnApplied } = await import(
        "@server/services/social-media"
      );
      await autoPostOnApplied({
        id: "job-1",
        title: "Engineer",
        employer: "Acme",
      } as any);

      // LLM should not be called if auto-post is disabled
      expect(mockCallJson).not.toHaveBeenCalled();
    });

    it("does not throw when a platform post fails", async () => {
      const { listConnections, getConnection } = await import(
        "@server/repositories/social-connections"
      );
      vi.mocked(listConnections).mockResolvedValueOnce([
        {
          id: "row-1",
          tenantId: "t1",
          userId: "u1",
          platform: "instagram",
          accountId: "acc-2",
          accountName: null,
          accessToken: "composio-managed",
          refreshToken: null,
          expiresAt: null,
          autoPostEnabled: true,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);

      vi.mocked(getConnection).mockResolvedValueOnce({
        id: "row-1",
        tenantId: "t1",
        userId: "u1",
        platform: "instagram",
        accountId: "acc-2",
        accountName: null,
        accessToken: "composio-managed",
        refreshToken: null,
        expiresAt: null,
        autoPostEnabled: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      // Composio post call fails
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      }) as typeof fetch;

      const { autoPostOnApplied } = await import(
        "@server/services/social-media"
      );
      // Should not throw — errors are caught and logged as warnings
      await expect(
        autoPostOnApplied({
          id: "job-1",
          title: "Engineer",
          employer: "Acme",
        } as any),
      ).resolves.toBeUndefined();
    });
  });
});
