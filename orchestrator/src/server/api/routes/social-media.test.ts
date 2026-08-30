import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

// Mock the Composio fetch so tests don't require a live API key
vi.mock("@server/services/social-media", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@server/services/social-media")>();
  return {
    ...actual,
    getOAuthUrl: vi.fn().mockResolvedValue({
      url: "https://composio.dev/oauth/connect?token=abc",
    }),
    handleOAuthCallback: vi.fn().mockResolvedValue(undefined),
    disconnectPlatform: vi.fn().mockResolvedValue(undefined),
    updateAutoPost: vi.fn().mockResolvedValue(undefined),
    generateShareContent: vi
      .fn()
      .mockResolvedValue({ content: "Excited to announce I applied!" }),
    postToSocial: vi.fn().mockResolvedValue({
      posted: true,
      postUrl: "https://linkedin.com/post/1",
    }),
    getConnections: vi.fn().mockResolvedValue([]),
  };
});

describe.sequential("Social Media API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: { COMPOSIO_API_KEY: "test-key" },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  describe("GET /api/social/connections", () => {
    it("returns empty list when no connections exist", async () => {
      const res = await fetch(`${baseUrl}/api/social/connections`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toEqual([]);
      expect(typeof body.meta.requestId).toBe("string");
    });

    it("returns connected accounts", async () => {
      const { getConnections } = await import("@server/services/social-media");
      vi.mocked(getConnections).mockResolvedValueOnce([
        {
          platform: "linkedin",
          accountName: "Alice",
          autoPostEnabled: true,
          connectedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);

      const res = await fetch(`${baseUrl}/api/social/connections`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].platform).toBe("linkedin");
      expect(body.data[0].accountName).toBe("Alice");
    });
  });

  describe("POST /api/social/oauth/start", () => {
    it("returns composio redirect URL for linkedin", async () => {
      const res = await fetch(`${baseUrl}/api/social/oauth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "linkedin",
          redirectUri: "https://example.com/settings",
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.url).toBe(
        "https://composio.dev/oauth/connect?token=abc",
      );
    });

    it("returns 400 for invalid platform", async () => {
      const res = await fetch(`${baseUrl}/api/social/oauth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "twitter",
          redirectUri: "https://example.com/settings",
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });

    it("returns 400 when redirectUri is missing", async () => {
      const res = await fetch(`${baseUrl}/api/social/oauth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "linkedin" }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });
  });

  describe("POST /api/social/oauth/callback", () => {
    it("calls handleOAuthCallback and returns connected: true", async () => {
      const { handleOAuthCallback } = await import(
        "@server/services/social-media"
      );

      const res = await fetch(`${baseUrl}/api/social/oauth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "linkedin",
          connectionId: "conn-abc-123",
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.connected).toBe(true);
      expect(handleOAuthCallback).toHaveBeenCalledWith({
        platform: "linkedin",
        connectionId: "conn-abc-123",
      });
    });

    it("returns 400 for missing connectionId", async () => {
      const res = await fetch(`${baseUrl}/api/social/oauth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "instagram" }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });
  });

  describe("DELETE /api/social/connections/:platform", () => {
    it("disconnects a platform", async () => {
      const { disconnectPlatform } = await import(
        "@server/services/social-media"
      );

      const res = await fetch(`${baseUrl}/api/social/connections/linkedin`, {
        method: "DELETE",
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.disconnected).toBe(true);
      expect(disconnectPlatform).toHaveBeenCalledWith("linkedin");
    });

    it("returns 400 for unknown platform", async () => {
      const res = await fetch(`${baseUrl}/api/social/connections/twitter`, {
        method: "DELETE",
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });
  });

  describe("PATCH /api/social/connections/:platform/auto-post", () => {
    it("enables auto-post for instagram", async () => {
      const { updateAutoPost } = await import("@server/services/social-media");

      const res = await fetch(
        `${baseUrl}/api/social/connections/instagram/auto-post`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.updated).toBe(true);
      expect(updateAutoPost).toHaveBeenCalledWith("instagram", true);
    });

    it("returns 400 when enabled is missing", async () => {
      const res = await fetch(
        `${baseUrl}/api/social/connections/linkedin/auto-post`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });
  });

  describe("POST /api/social/generate", () => {
    it("returns generated content", async () => {
      const res = await fetch(`${baseUrl}/api/social/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "linkedin",
          jobTitle: "Senior Engineer",
          employer: "Acme Corp",
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.content).toBe("Excited to announce I applied!");
    });

    it("returns 400 for missing required fields", async () => {
      const res = await fetch(`${baseUrl}/api/social/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "linkedin" }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });
  });

  describe("POST /api/social/post", () => {
    it("posts content and returns post URL", async () => {
      const res = await fetch(`${baseUrl}/api/social/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "linkedin",
          content: "Just applied to Acme Corp as Senior Engineer! 🎉",
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.posted).toBe(true);
      expect(body.data.postUrl).toBe("https://linkedin.com/post/1");
    });

    it("returns 400 for empty content", async () => {
      const res = await fetch(`${baseUrl}/api/social/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "linkedin", content: "" }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });

    it("returns 400 for content exceeding 5000 chars", async () => {
      const res = await fetch(`${baseUrl}/api/social/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "instagram",
          content: "x".repeat(5001),
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });
  });
});
