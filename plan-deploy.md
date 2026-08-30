# Deploy Plan — ify-app (Post Swarm + Composio Gmail + Analytics)

## Overview
Deploy `main` (commit `feat: Composio Gmail/LinkedIn v3.1, Analytics merge, PDF binaries`) to production (Docker Compose or hosted).

## Pre-flight
- Node 22.22.1 (Volta)
- Env: `COMPOSIO_API_KEY`, `COMPOSIO_GMAIL_AUTH_CONFIG_ID=ac_xgEQIyYC-Str`, `COMPOSIO_LINKEDIN_AUTH_CONFIG_ID=ac_pz7bek9GQ3s5`, `OPENROUTER_API_KEY`, `RXRESUME_API_KEY`, `TYPST_BIN`, `TECTONIC_BIN`, `IFYAPP_PUBLIC_BASE_URL`
- DB: SQLite `./orchestrator/data/jobs.db` (auto-migrate on boot via `migrate.ts`)

## Steps
1. **Pull & build**
   ```bash
   git pull origin main
   npm install
   npm run check:types:shared && npm --workspace orchestrator run check:types
   ./orchestrator/node_modules/.bin/biome ci .
   npm --workspace orchestrator run build:client
   ```
2. **Migrate DB**
   ```bash
   npm --workspace orchestrator run db:migrate
   # creates post_generations, social_connections if missing
   ```
3. **Binaries** (for PDF)
   ```bash
   # Already in ~/.local/bin, ensure PATH or TYPST_BIN/TECTONIC_BIN in .env or Dockerfile
   typst --version # 0.15.1
   tectonic --version # 0.17.0
   ```
4. **Docker (if using)**
   ```bash
   docker compose build --no-cache
   docker compose up -d
   # verify: curl http://localhost:3001/health && curl http://localhost:3001/api/post-application/providers/gmail/actions/status -H "Cookie: ..."
   ```
5. **Non-Docker**
   ```bash
   npm --workspace orchestrator run dev
   # Backend 3001, Frontend 5173 (proxy /api)
   ```
6. **Smoke tests**
   - `/post` → Generate `[mock]` → History → Publish (mock) → `https://mock.linkedin.com/...`
   - `/post` → Generate real (without [mock]) → Publish LinkedIn `ca_AwuEgriTJTUd` → check https://www.linkedin.com/feed/update/urn:li:share:749987...
   - `/tracking-inbox` → Sync (gmail via Composio `ca_Sv0C0y531SOa`) → Pending Review appears
   - `/analytics` → tabs Tracer/Watchlist, no version footer
   - `/design-resume` → Preview PDF (Typst)

## Rollback
- `git revert HEAD` + `docker compose down && docker compose up -d` or restore `jobs.db` backup from `orchestrator/data/pdfs` volume.

## Post-deploy checks
- `x-request-id` header present, `meta.requestId` in API responses
- Tenant isolation: `post_generations` filtered by `tenantId`

## Notes
- `composio-core` SDK not used (raw v3.1 REST); `composio_API 410` fixed via `api/v3.1`
- Gmail sync now supports both `refreshToken` and `composioAccountId` (status fix)
- LinkedIn publish now uses `LINKEDIN_GET_MY_INFO` → `LINKEDIN_CREATE_LINKED_IN_POST` with author URN
