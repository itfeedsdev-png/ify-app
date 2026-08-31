import {
  generatePersonalBrand,
  listPersonalBrandHistory,
  publishPersonalBrand,
  researchPersonalBrand,
} from "@client/api/personal-brand";
import { listSocialConnections } from "@client/api/social-media";
import { showErrorToast } from "@client/lib/error-toast";
import type {
  PersonalBrandContext,
  PersonalBrandPlatform,
  PersonalBrandTone,
  PostPack,
  SwarmResearchResult,
} from "@shared/types/personal-brand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Calendar,
  Copy,
  Github,
  Instagram,
  Linkedin,
  Loader2,
  PenLine,
  Search,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { type Event, EventManager } from "@/components/ui/event-manager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, PageMain } from "../components/layout";

const TONE_OPTIONS: Array<{
  value: PersonalBrandTone;
  label: string;
  hint: string;
}> = [
  {
    value: "professional",
    label: "Professional",
    hint: "LinkedIn-ready, concise, credible",
  },
  {
    value: "storytelling",
    label: "Storytelling",
    hint: "Narrative, human, journey-focused",
  },
  {
    value: "technical",
    label: "Technical",
    hint: "Stack, metrics, how-it-works",
  },
  {
    value: "casual",
    label: "Casual",
    hint: "Friendly, emoji-light, conversational",
  },
  { value: "custom", label: "Custom", hint: "Your own voice" },
];

const PLATFORM_META: Record<
  PersonalBrandPlatform,
  { label: string; icon: React.FC<{ className?: string }>; color: string }
> = {
  linkedin: { label: "LinkedIn", icon: Linkedin, color: "bg-[#0A66C2]" },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    color: "bg-gradient-to-br from-purple-600 to-pink-500",
  },
  github: { label: "GitHub", icon: Github, color: "bg-zinc-900" },
};

function AgentCard({ result }: { result: SwarmResearchResult }) {
  const confColor =
    result.confidence === "high"
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20"
      : result.confidence === "low"
        ? "bg-amber-500/15 text-amber-600 border-amber-500/20"
        : "bg-zinc-500/10 text-zinc-500 border-zinc-500/10";
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide">
          {result.agent}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] ${confColor}`}
        >
          {result.confidence}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3">
        {result.summary}
      </p>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {result.latencyMs}ms • {result.source}
      </div>
    </div>
  );
}

export const PostPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState(
    "Building in public: lessons from shipping ify app",
  );
  const [platforms, setPlatforms] = useState<PersonalBrandPlatform[]>([
    "linkedin",
    "instagram",
  ]);
  const [tone, setTone] = useState<PersonalBrandTone>("professional");
  const [customTone, setCustomTone] = useState("");
  const [research, setResearch] = useState<SwarmResearchResult[] | null>(null);
  const [context, setContext] = useState<PersonalBrandContext | null>(null);
  const [packs, setPacks] = useState<PostPack[] | null>(null);
  const [busy, setBusy] = useState<"research" | "generate" | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [scheduledEvents, setScheduledEvents] = useState<Event[]>([]);

  const connectionsQuery = useQuery({
    queryKey: ["social-connections"],
    queryFn: listSocialConnections,
  });

  const historyQuery = useQuery({
    queryKey: ["personal-brand-history"],
    queryFn: () => listPersonalBrandHistory(20),
  });

  const togglePlatform = (p: PersonalBrandPlatform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const handleResearch = useCallback(async () => {
    setBusy("research");
    try {
      const res = await researchPersonalBrand();
      setResearch(res.results);
      setContext(res.context);
      toast.success("Swarm research complete", {
        description: res.results
          .map((r) => `${r.agent}:${r.confidence}`)
          .join(" • "),
      });
    } catch (error) {
      showErrorToast(error, "Research failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || platforms.length === 0) {
      toast.error("Add a topic and pick at least one platform");
      return;
    }
    setBusy("generate");
    try {
      const res = await generatePersonalBrand({
        topic: topic.trim(),
        platforms,
        tone,
        customTone: tone === "custom" ? customTone : undefined,
      });
      setResearch(res.research);
      setContext(res.context);
      setPacks(res.packs);
      const edits: Record<string, string> = {};
      for (const p of res.packs) edits[p.platform] = p.content;
      setEditing(edits);
      await queryClient.invalidateQueries({
        queryKey: ["personal-brand-history"],
      });
      toast.success("Pack generated", {
        description: `${res.packs.length} variants • ${tone}`,
      });
    } catch (error) {
      showErrorToast(error, "Generate failed");
    } finally {
      setBusy(null);
    }
  }, [topic, platforms, tone, customTone, queryClient]);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const handlePublish = async (platform: PersonalBrandPlatform) => {
    const content = editing[platform]?.trim();
    if (!content) {
      toast.error("Nothing to publish");
      return;
    }
    if (platform === "github") {
      toast.info("GitHub publish coming soon — copy markdown for now");
      return;
    }
    try {
      const res = await publishPersonalBrand({ platform, content });
      toast.success(`Posted to ${platform}`, {
        description: res.postUrl ? "View post" : undefined,
        action: res.postUrl
          ? { label: "Open", onClick: () => window.open(res.postUrl, "_blank") }
          : undefined,
      });
    } catch (error) {
      showErrorToast(error, `Publish to ${platform} failed`);
    }
  };

  const handleSchedule = (platform: PersonalBrandPlatform) => {
    const content =
      editing[platform]?.trim() ||
      packs?.find((p) => p.platform === platform)?.content ||
      "";
    if (!content) {
      toast.error("Nothing to schedule");
      return;
    }
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const platformColors: Record<PersonalBrandPlatform, string> = {
      linkedin: "blue",
      instagram: "pink",
      github: "green",
    };
    const newEvent: Omit<Event, "id"> = {
      title: `${PLATFORM_META[platform].label}: ${content.slice(0, 40)}...`,
      description: content,
      startTime: start,
      endTime: end,
      color: platformColors[platform],
      category: PLATFORM_META[platform].label,
      tags: [tone, platform],
    };
    setScheduledEvents((prev) => [
      ...prev,
      { ...newEvent, id: Math.random().toString(36).slice(2, 9) },
    ]);
    toast.success(
      `Scheduled to ${PLATFORM_META[platform].label} — check Schedule tab`,
    );
  };

  return (
    <>
      <PageHeader
        icon={PenLine}
        title="Post"
        subtitle="Personal branding swarm — research across profile + GitHub + LinkedIn + Instagram, then generate"
      />
      <PageMain>
        <Tabs defaultValue="create" className="space-y-6">
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="connect">Connect</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              {/* Left: controls */}
              <Card className="h-fit border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" /> Create pack
                  </CardTitle>
                  <CardDescription>
                    Pick topic, platforms, tone — swarm does the rest
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="topic">Topic</Label>
                    <Textarea
                      id="topic"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. What I learned fixing Composio Gmail sync"
                      className="min-h-[90px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Platforms</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          "linkedin",
                          "instagram",
                          "github",
                        ] as PersonalBrandPlatform[]
                      ).map((p) => {
                        const meta = PLATFORM_META[p];
                        const Icon = meta.icon;
                        const active = platforms.includes(p);
                        return (
                          <label
                            key={p}
                            htmlFor={`platform-${p}`}
                            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-xs ${active ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"}`}
                          >
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${meta.color}`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            {meta.label}
                            <Checkbox
                              id={`platform-${p}`}
                              checked={active}
                              onCheckedChange={() => togglePlatform(p)}
                              className="sr-only"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select
                      value={tone}
                      onValueChange={(v) => setTone(v as PersonalBrandTone)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label} — {o.hint}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {tone === "custom" && (
                      <Input
                        value={customTone}
                        onChange={(e) => setCustomTone(e.target.value)}
                        placeholder="Your voice: witty, minimal, ... "
                      />
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void handleResearch()}
                      disabled={busy === "research"}
                      className="flex-1"
                    >
                      {busy === "research" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      Research
                    </Button>
                    <Button
                      onClick={() => void handleGenerate()}
                      disabled={busy === "generate"}
                      className="flex-1"
                    >
                      {busy === "generate" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Generate
                    </Button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Swarm: 4 agents parallel (profile • github • linkedin •
                    instagram) → synthesize → generate per platform → critic.
                    Graceful degrade if not connected.
                  </p>
                </CardContent>
              </Card>

              {/* Right: research + packs */}
              <div className="space-y-6">
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4" /> Research preview
                    </CardTitle>
                    <CardDescription>
                      {research
                        ? `${research.length} agents • ${research.filter((r) => r.confidence === "high").length} high confidence`
                        : "Run Research or Generate to see swarm output"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {research ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {research.map((r) => (
                          <AgentCard key={r.agent} result={r} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No research yet — click Generate (auto-runs swarm) or
                        Research
                      </div>
                    )}
                    {context && (
                      <div className="mt-4 rounded-xl bg-muted/30 p-3 text-xs leading-relaxed">
                        <span className="font-semibold">Synthesized:</span>{" "}
                        {context.profile.slice(0, 220)}
                        {context.topSkills.length
                          ? ` • Skills: ${context.topSkills.slice(0, 4).join(", ")}`
                          : ""}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {packs ? (
                  <div className="grid gap-4">
                    {packs.map((pack) => {
                      const meta = PLATFORM_META[pack.platform];
                      const Icon = meta.icon;
                      return (
                        <Card
                          key={pack.platform}
                          className="border-border/60 overflow-hidden"
                        >
                          <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-sm">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${meta.color}`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              {meta.label}
                              <Badge
                                variant="outline"
                                className="ml-auto text-[11px]"
                              >
                                {tone}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <Textarea
                              value={editing[pack.platform] ?? ""}
                              onChange={(e) =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [pack.platform]: e.target.value,
                                }))
                              }
                              className="min-h-[160px] font-[450] leading-relaxed"
                            />
                            {pack.hashtags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {pack.hashtags.map((h) => (
                                  <Badge
                                    key={h}
                                    variant="secondary"
                                    className="text-[11px]"
                                  >
                                    {h.startsWith("#") ? h : `#${h}`}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {pack.cta && (
                              <p className="text-xs text-muted-foreground">
                                CTA: {pack.cta}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void handleCopy(editing[pack.platform] ?? "")
                                }
                              >
                                <Copy className="h-3.5 w-3.5" /> Copy
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  void handlePublish(pack.platform)
                                }
                              >
                                <Send className="h-3.5 w-3.5" />{" "}
                                {pack.platform === "github"
                                  ? "Copy markdown"
                                  : "Publish"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleSchedule(pack.platform)}
                              >
                                <Calendar className="h-3.5 w-3.5" /> Schedule
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const orig =
                                    packs.find(
                                      (p) => p.platform === pack.platform,
                                    )?.content ?? "";
                                  setEditing((prev) => ({
                                    ...prev,
                                    [pack.platform]: orig,
                                  }));
                                }}
                              >
                                Reset
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      Generated packs will appear here — pick platforms and hit
                      Generate.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4" /> Schedule
                </CardTitle>
                <CardDescription>
                  Drag to reschedule • Click to edit • Publish uses swarm packs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EventManager
                  events={scheduledEvents}
                  onEventCreate={(event) =>
                    setScheduledEvents((prev) => [
                      ...prev,
                      { ...event, id: Math.random().toString(36).slice(2, 9) },
                    ])
                  }
                  onEventUpdate={(id, patch) =>
                    setScheduledEvents((prev) =>
                      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
                    )
                  }
                  onEventDelete={(id) =>
                    setScheduledEvents((prev) =>
                      prev.filter((e) => e.id !== id),
                    )
                  }
                  categories={[
                    "LinkedIn Post",
                    "Instagram Post",
                    "GitHub Post",
                    "Personal Branding",
                  ]}
                  availableTags={[
                    "Work",
                    "Personal",
                    "Important",
                    "Urgent",
                    "Team",
                  ]}
                  defaultView="month"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-sm">History</CardTitle>
                <CardDescription>
                  Tenant-scoped generations, newest first
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : !historyQuery.data?.length ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No generations yet — create your first pack.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyQuery.data.map((h) => (
                      <div
                        key={h.id}
                        className="rounded-xl border border-border/60 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium line-clamp-1">
                            {h.topic}
                          </span>
                          <Badge variant="outline" className="text-[11px]">
                            {h.tone}
                          </Badge>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {new Date(h.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {h.platforms.map((p) => (
                            <Badge
                              key={p}
                              variant="secondary"
                              className="text-[11px]"
                            >
                              {p}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-2 grid gap-2">
                          {h.packs.slice(0, 2).map((p) => (
                            <div
                              key={p.platform}
                              className="rounded-lg bg-muted/30 p-2 text-xs leading-relaxed line-clamp-2"
                            >
                              <span className="font-semibold">
                                {p.platform}:
                              </span>{" "}
                              {p.content.slice(0, 160)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="connect">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BadgeCheck className="h-4 w-4" /> Connections
                </CardTitle>
                <CardDescription>
                  Swarm uses these — connect once, works across agents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {connectionsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  (["linkedin", "instagram", "github"] as const).map((p) => {
                    const conn = connectionsQuery.data?.find(
                      (c) => c.platform === (p as unknown as string),
                    );
                    const isConnected = Boolean(conn);
                    return (
                      <div
                        key={p}
                        className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-sm capitalize">
                          {p === "linkedin" && <Linkedin className="h-4 w-4" />}
                          {p === "instagram" && (
                            <Instagram className="h-4 w-4" />
                          )}
                          {p === "github" && <Github className="h-4 w-4" />}
                          {p}
                        </span>
                        <Badge
                          variant={isConnected ? "default" : "outline"}
                          className="text-[11px]"
                        >
                          {isConnected
                            ? (conn?.accountName ?? "Connected")
                            : "Not connected"}
                        </Badge>
                      </div>
                    );
                  })
                )}
                <p className="text-xs text-muted-foreground">
                  Connect via{" "}
                  <span className="font-medium">Settings → Social</span>{" "}
                  (LinkedIn/Instagram) and profile GitHub. Swarm degrades
                  gracefully if not connected.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageMain>
    </>
  );
};
