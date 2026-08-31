# ify — AI-Powered Job Search Automation with Social Media Integration

## What is ify

ify is a full-stack job search automation platform that helps fresh graduates, students, and job seekers apply to jobs at scale while maintaining their professional brand across LinkedIn, Instagram, and Gmail — powered by AI agents and multi-model LLM chains.

## The Problem

Job searching is broken. Fresh graduates spend 4+ hours a day manually scanning job boards, writing custom resumes and cover letters for each application, tracking where they applied across spreadsheets and notes, and trying to maintain a professional presence on LinkedIn and Instagram. Most give up after 50 applications because the process is unscalable and exhausting.

## How ify Solves It

### AI-Powered Job Pipeline

Multi-source job discovery across 10+ platforms with automatic parsing, deduplication, and scoring. Jobs flow through a 4-step pipeline — discover, extract, parse, score — fully automated with zero manual input.

### Gmail Tracking Inbox

Connect your Gmail via OAuth and ify automatically tracks job application emails, extracts sender and company information, and surfaces everything in a unified inbox.

### Personal Branding Swarm

A 4-agent AI system that researches your professional profile, GitHub repositories, LinkedIn presence, and Instagram footprint — then synthesizes findings into platform-specific posts. A built-in critic agent rates content quality before you publish.

### AI Resume Generation

Upload a PDF resume and ify parses it deterministically into structured data — no LLM required — then renders it into professionally designed PDFs using Typst, Tectonic LaTeX, or Reactive Resume API, all server-side.

### Smart Model Chain

LLM calls never fail. A 7-model fallback chain across 2 providers ensures zero downtime and zero extra cost: if the primary provider goes down, it transparently falls back to free alternative models.

### Social Media Integration

One-click OAuth for LinkedIn, Instagram, and Gmail. Publish posts directly from the app, track engagement, and manage your brand from one dashboard — built on Composio's v3.1 API with automatic token refresh and error recovery.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Tanstack Query, Shadcn UI |
| Backend | Express, TypeScript, SQLite |
| Auth | OAuth (Google), JWT |
| Social Media | Composio v3.1 REST API |
| PDF Renderers | Typst, Tectonic LaTeX, Reactive Resume API |
| LLM | SumoPod AI + OpenRouter (7-model fallback chain) |
| Deployment | Railway (Docker), Vercel (landing) |
| CI/CD | GitHub Actions → GHCR |

## Architecture Highlights

- Multi-tenant by default — every route is tenant-scoped with zero cross-tenant data leakage
- Correlation IDs — every request traced end-to-end through logs and async jobs
- SSE streaming — real-time pipeline updates with no polling
- Graceful LLM fallback — never fails, never costs extra, never exposes API keys to the wrong provider
- Deterministic PDF parsing — regex and heuristic parser extracts structured resume JSON without any LLM call

## What's Next

- Job application auto-fill — link resume to job, auto-apply
- Analytics dashboard — track application response rates
- Mobile app — React Native
- More social platforms — Twitter/X, TikTok

## Links

- **Live Demo:** https://ify-app-production.up.railway.app
- **GitHub:** https://github.com/maulana-tech/ify-app
