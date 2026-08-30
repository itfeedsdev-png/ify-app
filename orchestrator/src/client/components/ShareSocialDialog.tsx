/**
 * ShareSocialDialog - modal for generating and posting to LinkedIn/Instagram.
 * Opened from the job detail panel when a social platform is connected.
 */

import { generateSocialContent, postToSocial } from "@client/api/social-media";
import { showErrorToast } from "@client/lib/error-toast";
import type { SocialPlatform } from "@shared/types";
import { Instagram, Linkedin, Loader2, Send, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ShareSocialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: SocialPlatform;
  jobTitle: string;
  employer: string;
  jobUrl?: string | null;
}

const PlatformIcon: React.FC<{ platform: SocialPlatform }> = ({ platform }) => {
  if (platform === "linkedin") return <Linkedin className="h-4 w-4" />;
  return <Instagram className="h-4 w-4" />;
};

const platformLabel: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  gmail: "Gmail",
};

export const ShareSocialDialog: React.FC<ShareSocialDialogProps> = ({
  open,
  onOpenChange,
  platform,
  jobTitle,
  employer,
  jobUrl,
}) => {
  const [content, setContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const handleClose = useCallback(() => {
    setContent("");
    onOpenChange(false);
  }, [onOpenChange]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const result = await generateSocialContent({
        platform,
        jobTitle,
        employer,
        jobUrl,
        tone: "professional",
        includeHashtags: true,
      });
      setContent(result.content);
    } catch (error) {
      showErrorToast(error, "Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  }, [platform, jobTitle, employer, jobUrl]);

  const handlePost = useCallback(async () => {
    if (!content.trim()) return;
    setIsPosting(true);
    try {
      const result = await postToSocial({ platform, content });
      toast.success(`Posted to ${platformLabel[platform]}!`, {
        description: result.postUrl ? "View your post →" : undefined,
        action: result.postUrl
          ? {
              label: "View post",
              onClick: () => window.open(result.postUrl, "_blank"),
            }
          : undefined,
      });
      handleClose();
    } catch (error) {
      showErrorToast(error, `Failed to post to ${platformLabel[platform]}`);
    } finally {
      setIsPosting(false);
    }
  }, [content, platform, handleClose]);

  const charLimit = platform === "linkedin" ? 3000 : 2200;
  const overLimit = content.length > charLimit;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlatformIcon platform={platform} />
            Share to {platformLabel[platform]}
          </DialogTitle>
          <DialogDescription>
            {jobTitle} at {employer}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="social-content">Post content</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              {content ? "Regenerate with AI" : "Generate with AI"}
            </Button>
          </div>

          <Textarea
            id="social-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Write your ${platformLabel[platform]} post here, or click "Generate with AI" to get a draft…`}
            className="min-h-[160px] resize-y"
            disabled={isPosting}
          />

          <div className="flex justify-end">
            <span
              className={
                overLimit
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {content.length} / {charLimit}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPosting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handlePost()}
            disabled={!content.trim() || overLimit || isPosting}
          >
            {isPosting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
