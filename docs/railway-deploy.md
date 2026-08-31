# Deploy ify-app to Railway — Detailed Guide

> **One-click Docker deploy for hackathon/demo.** Railway auto-detects `Dockerfile` at repo root, builds multi-stage image (Typst + Tectonic + Node 22), and exposes `https://*.railway.app`.

## 1. What it is

Deploy `maulana-tech/ify-app` to **Railway** via Docker. Single service exposes `PORT=3001` with healthcheck `GET /health`.

## 2. Why Railway (vs DeewaCloud/VPS)

| Platform | Build | Runtime | Cost (hackathon) | Auto-deploy |
|----------|-------|---------|------------------|-------------|
| DeewaCloud PaaS | Manual Node.js 22 PaaS, 16 cloudlets for build (~Rp 549/h) | 2 containers (SLB + App), OOM on build | Hourly | Manual Git pull |
| **Railway** | **Auto Dockerfile detect, layer cache** | **1 container, 512 MB sufficient, auto-scale** | **$5 credit free** | **Auto on push to `main`** |

Railway is cheapest + simplest for full-stack Node + SQLite (`/app/data` volume).

## 3. How to use — Step-by-step

### 3.1 Prerequisites

- GitHub repo `maulana-tech/ify-app` public, branch `main` pushed (latest `9183952` + doc fixes).
- Env values ready: see `plan-deploy.md` — `COMPOSIO_API_KEY`, `OPENROUTER_API_KEY`, `RXRESUME_API_KEY`, `COMPOSIO_GMAIL_AUTH_CONFIG_ID=ac_xgEQIyYC-Str`, `COMPOSIO_LINKEDIN_AUTH_CONFIG_ID=ac_pz7bek9GQ3s5`.

### 3.2 Create project

1. **railway.app** → **Login with GitHub** → **New Project** → **Deploy from GitHub repo** → select `maulana-tech/ify-app`
2. Railway detects **Dockerfile** → **Deploy** (first build ~6-10 min, cached later ~1-2 min)
3. **Settings → Domains** → **Generate Domain** → copy `https://ify-app-production.up.railway.app`

### 3.3 Variables (Service → Variables)

Paste all (Railway supports bulk paste):

```
PORT=3001
DATA_DIR=/app/data
COMPOSIO_API_KEY=ak_...
COMPOSIO_GMAIL_AUTH_CONFIG_ID=ac_xgEQIyYC-Str
COMPOSIO_LINKEDIN_AUTH_CONFIG_ID=ac_pz7bek9GQ3s5
OPENROUTER_API_KEY=sk-or-...
RXRESUME_API_KEY=wdlHt...
IFYAPP_PUBLIC_BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
TYPST_BIN=/usr/local/bin/typst
TECTONIC_BIN=/usr/local/bin/tectonic
```

> `RAILWAY_PUBLIC_DOMAIN` is auto-injected — no hardcode.

### 3.4 Volume (for SQLite persistence)

**Settings → Volumes → Add Volume** → Mount `/app/data` (1 GB). Without volume, `jobs.db` resets on redeploy.

### 3.5 Deploy & verify

```bash
curl https://ify-app-production.up.railway.app/health
# {"ok":true}

curl https://ify-app-production.up.railway.app/api/auth/bootstrap
curl -X POST https://ify-app-production.up.railway.app/api/personal-brand/generate \
  -H "Content-Type: application/json" -H "Cookie: <from login>" \
  -d '{"topic":"Test [mock]","platforms":["linkedin"],"tone":"professional"}'
```

In app: `/post` → Generate `[mock]` → History → Publish mock → Tracking Inbox → Sync (gmail via Composio).

### 3.6 Auto-deploy

Every `git push origin main` → Railway webhook → rebuild (cache hit) → rolling restart (~30s downtime).

## 4. Common problems

- **Build OOM** — Railway default 8 GB memory, no issue (vs DeewaCloud 4 cloudlets 512 MB). If hit, Settings → increase memory to 1 GB.
- **/health 404** — Check `PORT=3001` set, Dockerfile `EXPOSE 3001` matches Railway `PORT` injection.
- **Gmail 403 access_denied** — Add test user in Google Cloud OAuth consent (not Railway).
- **Composio 410 / 400** — Already fixed to `api/v3.1` (`auth_configs`, `connected_accounts`, `tools/execute` with `arguments` + `user_id`).
- **DB reset** — Ensure volume mounted at `/app/data`.

## 5. Related pages

- [Self-Hosting (Docker Compose)](/docs/next/getting-started/self-hosting)
- [Gmail OAuth Setup](/docs/next/getting-started/gmail-oauth-setup)
- [Post — Personal Branding Swarm](/docs/next/features/post-personal-branding)
- [plan-deploy.md](/plan-deploy.md)

## 6. Rollback

Railway Dashboard → **Deployments** → **Redeploy** previous successful deployment (1 click).
