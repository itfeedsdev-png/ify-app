import {
  completeSocialOAuth,
  disconnectSocialPlatform,
  listSocialConnections,
  setSocialAutoPost,
  startSocialOAuth,
} from "@client/api/social-media";
import { showErrorToast } from "@client/lib/error-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Instagram, Linkedin, Loader2, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function SocialMediaSettingsSection() {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [callbackHandled, setCallbackHandled] = useState(false);

  const { data: connections } = useQuery({
    queryKey: ["social-connections"],
    queryFn: listSocialConnections,
  });

  /**
   * After Composio redirects back to /settings#social-media, complete the
   * OAuth handshake using the connectionId stored in sessionStorage (Composio
   * does not substitute {connectionId} placeholders in callback URLs).
   */
  useEffect(() => {
    if (callbackHandled) return;

    const params = new URLSearchParams(window.location.search);
    const platform = params.get("platform") as "linkedin" | "instagram" | null;

    // Prefer connectionId from sessionStorage (set before redirect)
    let connectionId: string | null = null;
    if (platform) {
      connectionId = sessionStorage.getItem(`social-oauth-${platform}`);
      sessionStorage.removeItem(`social-oauth-${platform}`);
    }
    // Fallback to URL params — Composio sends back connectedAccountId
    if (!connectionId) {
      connectionId =
        params.get("connectionId") ??
        params.get("connectedAccountId") ??
        params.get("connected_account_id") ??
        null;
    }

    if (!platform || !connectionId || connectionId === "undefined") return;
    if (platform !== "linkedin" && platform !== "instagram") return;

    setCallbackHandled(true);

    // Strip query params from URL without triggering a navigation
    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, "", cleanUrl);

    setConnecting(platform);
    completeSocialOAuth({ platform, connectionId })
      .then(() => {
        toast.success(
          `${platform === "linkedin" ? "LinkedIn" : "Instagram"} connected!`,
        );
        return queryClient.invalidateQueries({
          queryKey: ["social-connections"],
        });
      })
      .catch((error) => {
        showErrorToast(error, "Failed to complete OAuth connection");
      })
      .finally(() => {
        setConnecting(null);
      });
  }, [callbackHandled, queryClient]);

  const handleConnect = useCallback(
    async (platform: "linkedin" | "instagram") => {
      setConnecting(platform);
      try {
        // Clean redirect URI — Composio does not substitute {connectionId}
        const redirectUri = `${window.location.origin}/settings?platform=${platform}#social-media`;
        const { url, connectionId } = await startSocialOAuth({
          platform,
          redirectUri,
        });
        if (!url) {
          toast.success(
            `${platform === "linkedin" ? "LinkedIn" : "Instagram"} is already connected`,
          );
          await queryClient.invalidateQueries({
            queryKey: ["social-connections"],
          });
          setConnecting(null);
          return;
        }
        // Persist connectionId so we can complete the handshake after redirect
        sessionStorage.setItem(`social-oauth-${platform}`, connectionId);
        window.location.href = url;
      } catch (error) {
        showErrorToast(error, `Failed to start ${platform} connection`);
        setConnecting(null);
      }
    },
    [queryClient],
  );

  const handleDisconnect = useCallback(
    async (platform: "linkedin" | "instagram") => {
      if (!confirm(`Disconnect your ${platform} account?`)) return;
      try {
        await disconnectSocialPlatform(platform);
        await queryClient.invalidateQueries({
          queryKey: ["social-connections"],
        });
        toast.success(
          `${platform === "linkedin" ? "LinkedIn" : "Instagram"} disconnected`,
        );
      } catch (error) {
        showErrorToast(error, `Failed to disconnect ${platform}`);
      }
    },
    [queryClient],
  );

  const handleToggleAutoPost = useCallback(
    async (platform: "linkedin" | "instagram", enabled: boolean) => {
      try {
        await setSocialAutoPost(platform, enabled);
        await queryClient.invalidateQueries({
          queryKey: ["social-connections"],
        });
      } catch (error) {
        showErrorToast(error, "Failed to update auto-post setting");
      }
    },
    [queryClient],
  );

  const linkedin = connections?.find((c) => c.platform === "linkedin");
  const instagram = connections?.find((c) => c.platform === "instagram");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Linkedin className="h-5 w-5" />
            LinkedIn
          </CardTitle>
          <CardDescription>
            Connect your LinkedIn account to share job applications and
            milestones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {linkedin ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  Connected as {linkedin.accountName || "LinkedIn Account"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Auto-post when you mark jobs as applied
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={linkedin.autoPostEnabled}
                    onCheckedChange={(checked) =>
                      void handleToggleAutoPost("linkedin", checked)
                    }
                  />
                  <span className="text-sm">Auto-post</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDisconnect("linkedin")}
                >
                  <Unlink className="mr-1 h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => void handleConnect("linkedin")}
              disabled={connecting === "linkedin"}
            >
              {connecting === "linkedin" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Connect LinkedIn
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" />
            Instagram
          </CardTitle>
          <CardDescription>
            Connect your Instagram account to share your job search journey.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {instagram ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  Connected as {instagram.accountName || "Instagram Account"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Auto-post when you mark jobs as applied
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={instagram.autoPostEnabled}
                    onCheckedChange={(checked) =>
                      void handleToggleAutoPost("instagram", checked)
                    }
                  />
                  <span className="text-sm">Auto-post</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDisconnect("instagram")}
                >
                  <Unlink className="mr-1 h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => void handleConnect("instagram")}
              disabled={connecting === "instagram"}
            >
              {connecting === "instagram" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Connect Instagram
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
