# Post — Personal Branding Swarm Agent — Plan

> **Status:** Planning → Awaiting Approval → Execution
> **Owner:** ify-app / Post module
> **Branch:** `main` (feature: `feat/personal-brand-swarm`)

## 1. What it is
Halaman terpisah **`/post`** untuk **Agent Personal Branding** dengan **swarm** riset. User pilih `tone` + `platform` sesuai kemauan, agent swarm riset **personalized user (profile + resume + jobs) + GitHub + LinkedIn + Instagram** via Composio `connected_account` yang sudah ada, lalu generate **multi-platform pack** (LinkedIn / Instagram / GitHub README/post) yang siap draft → preview → post via Composio.

## 2. Why it exists
- `ShareSocialDialog` existing hanya generate caption singkat dari `jobTitle + employer` (tidak personal, tidak swarm).
- User butuh **riset mendalam** lintas source sebelum nulis, dan **swarm** biar paralel, saling cek, hasil konsisten.
- Perlu **WORKS end-to-end**: dari `Research → Synthesize → Generate → Critique → Final` tanpa manual copy-paste.

## 3. Swarm Architecture (WORKS)

```
[Coordinator] ──► [Swarm Research] ──► [Synthesizer] ──► [Generator] ──► [Critic] ──► Final Pack
                     ├─ ProfileAgent (DB: profile, resume, jobs applied)
                     ├─ GitHubAgent (Composio: GITHUB_* tools, fallback: public github api)
                     ├─ LinkedInAgent (Composio: LINKEDIN_* tools, connected_account_id)
                     └─ InstagramAgent (Composio: INSTAGRAM_* tools, connected_account_id)
```

- **Research Swarm**: 4 agent jalan **paralel** via `Promise.allSettled`, tiap agent return `{ source, summary, raw, confidence }`. Timeout 15s per agent, graceful degrade kalau satu source disconnected.
- **Inter-agent bus**: `SwarmContext = { profile, github, linkedin, instagram, jobsCount }` dishare via Coordinator, bukan global cache (tenant-safe).
- **Synthesizer (LLM)**: merger jadi `PersonalBrandContext` (tone hints, top skills, recent activity, audience).
- **Generator (LLM)**: terima `context + topic + platform[] + tone` → output `PostPack { platform, content, hashtags, cta, variants[3] }`.
- **Critic (LLM)**: review `PostPack` untuk brand consistency, toxicity, length limit per platform (LinkedIn 3000, IG 2200), auto-fix sekali.

**Coordination:** `orchestrator/src/server/services/personal-brand/swarm.ts` → `runSwarm(userId, tenantId, { topic, platforms, tone })`. Tiap agent adalah pure function, logs include `requestId + agentName + platform` (sesuai `AGENTS.md` logging).

## 4. How to use it (UX)

- **Nav**: baru **`Post`** (`/post`, icon `PenLine`) di `navigation.ts` antara `Tracking Inbox` dan `Analytics`.
- **Page `/post` tabs**:
  - **Create** — left: `Topic` input + `Platform` checkboxes (LinkedIn/Instagram/GitHub) + `Tone` select (`professional|storytelling|technical|casual|custom`) + `Generate` button + `Research depth` slider. Right: `Research Preview` (collapsible cards per agent) + `Generated Pack` (preview per platform, edit, regenerate, copy).
  - **History** — list `post_generations` dari DB (tenant-scoped) dengan filter platform/tone.
  - **Connect** — status GitHub/LinkedIn/Instagram (reuse `GET /api/social/connections`), tombol Connect via Composio.
- **Actions**: `Draft → Edit → Copy → Post via Composio` (`POST /api/personal-brand/publish` → `executeComposioTool`).

## 5. Implementation Plan (proper, step-by-step)

### Phase 1 — Types & DB (tenant-safe)
- [ ] `shared/src/types/personal-brand.ts`: `PersonalBrandPlatform = linkedin|instagram|github`, `SwarmAgentName`, `SwarmResearchResult`, `PostPack`, `PostGenerationRecord`.
- [ ] `orchestrator/src/server/db/schema.ts`: table `post_generations` (id, tenantId, userId, topic, platforms, tone, researchContext JSON, pack JSON, createdAt), index `tenantId+userId`.
- [ ] `npm --workspace orchestrator run db:migrate` (drizzle generate).

### Phase 2 — Swarm Service (WORKS)
- [ ] `orchestrator/src/server/services/personal-brand/research/profile.ts` — fetch profile + resume + last 5 jobs.
- [ ] `research/github.ts` — try Composio `GITHUB_LIST_REPOS` / `GITHUB_GET_COMMIT` via `executeComposioTool`, fallback public `api.github.com/users/{username}/repos` kalau not connected, truncate 3 repos.
- [ ] `research/linkedin.ts` — `LINKEDIN_GET_PROFILE` / recent posts via Composio, graceful `not_connected`.
- [ ] `research/instagram.ts` — `INSTAGRAM_GET_USER_MEDIA` via Composio, graceful.
- [ ] `research/index.ts` — `runResearchSwarm()` parallel `allSettled`, build `SwarmContext`, log per agent with `requestId`.
- [ ] `swarm.ts` — `runPersonalBrandSwarm()` orchestrates Research → Synthesize (LLM) → Generate (LLM, 1 call per platform) → Critique (LLM) → persist to `post_generations`. Uses `IFyApp` LLM provider (OpenRouter/meta-llama free), parse-only fallback.
- [ ] Sanitize LLM prompts: only send `profile.jobTitle, skills, bio` + `github.repo.name/desc` + `linkedin.headline` (no PII dump), redact before log (AGENTS.md).
- [ ] Add `docs/personal-brand-swarm.md` (id/title/description + What/Why/How/Common problems/Related pages).

### Phase 3 — API Routes
- [ ] `orchestrator/src/server/api/routes/personal-brand.ts`: `POST /research` (topic? optional), `POST /generate` (topic, platforms[], tone, customTone?), `GET /history`, `POST /publish` (platform, content, connectedAccountId). All return `{ ok, data, meta.requestId }`, propagate `requestId`, scoped by `getPrivateDataScope()`.
- [ ] Mount in `orchestrator/src/server/app.ts` / `routes` (check existing `social-media.ts` mount).

### Phase 4 — Client
- [ ] `orchestrator/src/client/api/personal-brand.ts` — typed fetch wrappers.
- [ ] `orchestrator/src/client/pages/PostPage.tsx` — tabs Create/History/Connect, proper loading/empty/error states, shadcn Tabs/Card/Textarea/Select, edit-in-place, copy, publish.
- [ ] `orchestrator/src/client/App.tsx` — route `/post` + redirect.
- [ ] `orchestrator/src/client/components/navigation.ts` — add `Post`.
- [ ] Reuse `SocialMediaSettingsSection` logic for connect status, but per-platform for github too.

### Phase 5 — Verification (CI parity)
- [ ] `biome ci .`
- [ ] `npm run check:types:shared && npm --workspace orchestrator run check:types`
- [ ] `npm --workspace orchestrator run build:client`
- [ ] `npm --workspace orchestrator run test:run` (add `personal-brand/*.test.ts` minimal).

## 6. Common problems
- **Satu agent timeout/disconnected** → swarm tetap lanjut, `confidence: low`, generator tulis dengan konteks yang ada, warning di UI `LinkedIn not connected — research skipped`.
- **Composio rate limit** → retry 1x dengan backoff, kalau gagal return `not_connected`.
- **LLM token limit** → truncate github repos 3, linkedin 2 posts, instagram 2 captions.
- **Tenant leak** → semua DB read/write filter `tenantId+userId` via `getPrivateDataScope()`.

## 7. Related pages
- `/docs/personal-brand-swarm` (baru)
- `/docs/features/post-personal-branding` (link dari docs-site sidebar)
- Terkait: `/docs/social-media`, `/docs/tracking-inbox`, `AGENTS.md` (correlation IDs, redaction).

## 8. Execution Order (after approval)
1. Phase 1 → Phase 2 (research agents parallel, test each agent isolated)
2. Phase 3 (mock swarm dulu, baru wiring LLM)
3. Phase 4 (client consume real API, handle empty/connected states)
4. Phase 5 (full CI)

> **Need approval before execute?** Reply `approve` → langsung eksekusi Phase 1-5. Atau minta revisi plan dulu.
