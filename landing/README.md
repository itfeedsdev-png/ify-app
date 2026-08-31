# Landing page (standalone deploy to Vercel)

This folder builds the public marketing landing page (`LandingPage.tsx`) as a **separate static app** so it can be deployed to **Vercel** independently of the main app (which runs on Railway as a Node/Docker service).

## How it works

- Entry: `landing/src/main.tsx` renders `orchestrator/src/client/pages/LandingPage.tsx` via the `@landing` alias.
- Styles: Tailwind v4 (`@tailwindcss/vite`) with `landing/src/index.css`.
- Assets: reuses `orchestrator/public` as `publicDir`, so screenshots resolve at `/landing/*.png`.
- CTA links: `AppLink` in `LandingPage.tsx` uses `VITE_APP_URL` when set → CTAs open the real app (Railway). Unset in the monolith build → keeps `react-router` `Link`.

## Local dev

```bash
cd landing
npm install
npm run dev
```

## Deploy to Vercel

1. Import repo → **Root Directory: `landing`**.
2. Framework preset: **Vite**.
3. Env: `VITE_APP_URL` = your app origin, e.g. `https://career-boardsbamboohr-production-5d85.up.railway.app`.
4. Deploy.

`vercel.json` sets the SPA rewrite (`/(.*)` → `/`) and injects `VITE_APP_URL` from a Vercel secret named `vite_app_url`.

## Notes

- The landing page is self-contained: it only needs `lenis` + `react-router-dom`.
- Keep screenshots in `orchestrator/public/landing/`.
- If you change `VITE_APP_URL`, redeploy the landing on Vercel (env vars are baked at build time).

## Sync

`landing` has no separate copy of the page — it imports the shared component from the orchestrator client tree, so it stays in sync automatically.
