# Plan: Composio Social Media Integration

## Overview
Integrate Composio for LinkedIn and Instagram social media posting within the ify app. Supports auto-post on applied, manual share from job detail, and LLM-generated content. OAuth connection flow is handled via Composio's managed auth.

---

## Completed

### Backend
- [x] **Database schema**: `social_connections` table with `platform`, `account_name`, `entity_id`, `access_token`, `refresh_token`, `auto_post_enabled`, `expires_at`, `connected_at`.
- [x] **Migration**: Added to `migrate.ts`.
- [x] **Repository layer**: `repositories/social-connections.ts` (CRUD + find by platform).
- [x] **Service layer**: `services/social-media.ts`:
  - Composio REST API integration (`/initiateConnection`, `/getExpectedParamsForUser`, `/execute`)
  - LLM content generation via `generateShareContent()`
  - `autoPostOnApplied()` hook called from `jobs/application.ts`
- [x] **API routes**: `/api/social` mounted in `routes.ts`:
  - `GET /connections` — list connections
  - `POST /oauth/start` — get Composio auth URL
  - `POST /oauth/callback` — placeholder (needs full implementation)
  - `DELETE /connections/:platform` — disconnect
  - `PATCH /connections/:platform/auto-post` — toggle auto-post
  - `POST /generate` — generate LLM content
  - `POST /post` — publish post
- [x] **Auto-post hook**: `application.ts` calls `autoPostOnApplied` when job status changed to `applied`.
- [x] **Shared types**: `shared/src/types/social-media.ts` exported correctly.

### Frontend
- [x] **Client API layer**: `client/api/social-media.ts` with typed wrappers.
- [x] **Settings UI tab**: `SocialMediaSettingsSection.tsx`:
  - LinkedIn & Instagram connection cards
  - Connect/disconnect buttons
  - Auto-post toggle per platform
  - Integrated into Settings page nav under "Integrations"

### Infrastructure
- [x] **App rename**: `job-ops` -> `ify-app` across monorepo (packages, env vars, UI strings, Docker, docs).
- [x] **Env vars**: `COMPOSIO_API_KEY` added to `.env.example`.
- [x] **CI parity**: biome, typecheck (shared + orchestrator + extractors), build:client, test:run all passing.
- [x] **Cleanup**: Removed stale `.playwright-mcp/` log folder and orphaned `orchestrator/orchestrator/.tmp`.

---

## In Progress / Next Steps

### 1. OAuth Callback Completion (Backend)
**Status**: Route exists but logic is a stub.
**What**: `POST /social/oauth/callback` currently returns `{ connected: true }` without verifying the connection with Composio.
**Needs**:
- Call Composio API to verify connection status and retrieve `entityId`.
- Persist `entityId`, `accountName`, and tokens to `social_connections`.
- Handle error cases (denied auth, expired session).

### 2. OAuth Callback Handler (Frontend)
**Status**: Not built.
**What**: After user authorizes on Composio, they are redirected back to `/settings#social-media`. The frontend needs to detect the callback and call `POST /social/oauth/callback`.
**Needs**:
- In `SocialMediaSettingsSection.tsx` (or a dedicated callback component), parse query params from the redirect URL.
- Call `completeSocialOAuth()` with `connectionId` from Composio.
- Show loading state, then success/error toast.

### 3. Job Detail Share Button
**Status**: Not built.
**What**: Add a "Share" action to the job detail page (or job card) allowing manual post to LinkedIn/Instagram.
**Needs**:
- Add "Share to LinkedIn" / "Share to Instagram" buttons in the job detail UI.
- Only show buttons if the respective platform is connected.
- Clicking opens a dialog/modal.

### 4. Share Content Dialog / Modal
**Status**: Not built.
**What**: Modal that lets the user generate or edit post content before publishing.
**Needs**:
- Pre-fill job title, employer, URL.
- "Generate with AI" button calling `POST /social/generate`.
- Textarea to edit generated content.
- "Post" button calling `POST /social/post`.
- Show success state with post URL if returned.

### 5. Testing
**Status**: Not started.
**Needs**:
- Unit tests for `social-media.ts` service (mock Composio API).
- Unit tests for `social-connections.ts` repository.
- API route tests for `/api/social/*`.
- Frontend component tests for `SocialMediaSettingsSection`.
- Add extractor deployment coverage check in `deployment.test.ts` if applicable.

### 6. Documentation
**Status**: Not started.
**Needs**:
- Update `docs-site/` with Social Media feature page (What it is, Why it exists, How to use it, Common problems, Related pages).
- Add frontmatter: `id`, `title`, `description`, `sidebar_position`.

---

## Optional / Future
- [ ] Support additional platforms (Twitter/X, Bluesky) — requires schema changes.
- [ ] Image upload support for Instagram (currently text-only via `imageUrl`).
- [ ] Scheduling posts instead of immediate publish.
- [ ] Analytics / post history tracking.

---

## Acceptance Criteria (for final PR)
- [ ] User can connect LinkedIn via Settings > Social Media.
- [ ] User can connect Instagram via Settings > Social Media.
- [ ] Auto-post toggle works; when enabled, marking a job as `applied` triggers a LinkedIn/Instagram post.
- [ ] Manual share button exists on job detail for connected platforms.
- [ ] LLM-generated content can be previewed and edited before posting.
- [ ] Disconnect removes the connection and stops auto-post.
- [ ] All API responses follow `{ ok, data/error, meta.requestId }` contract.
- [ ] No tenant data leaks; workspace-scoped throughout.
- [ ] CI parity passes: biome, typecheck, build, tests.
- [ ] Docs updated.
