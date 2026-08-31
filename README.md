<p align="center">
  <img src="orchestrator/public/images/logo.png" alt="ify Logo" width="200" />
</p>

<h1 align="center">ify</h1>

<p align="center">
  <strong>Intelligent For You</strong><br/>
  AI-Powered Job Search Automation with Social Media Integration
</p>

<p align="center">
  <a href="https://ify-app-production.up.railway.app">Live Demo</a> •
  <a href="https://github.com/maulana-tech/ify-app">GitHub</a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [Our Solution](#our-solution)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Challenges & Learnings](#challenges--learnings)
- [Future Roadmap](#future-roadmap)
- [Team](#team)

---

## Overview

**ify** (Intelligent For You) is a full-stack job search automation platform designed for fresh graduates, students, and job seekers who want to apply to jobs at scale while maintaining a strong professional brand across LinkedIn, Instagram, and Gmail.

Built with a multi-agent AI system, multi-model LLM fallback chain, and social media integration via Composio, ify transforms the job search from a tedious manual process into an intelligent, automated workflow.

---

## The Problem

Job searching is broken. Fresh graduates spend 4+ hours every day:

- **Scattering job boards** — manually visiting LinkedIn, Indeed, Glassdoor, and company career pages
- **Writing custom resumes** — tailoring each application for ATS optimization
- **Tracking applications** — managing spreadsheets, notes, and email threads
- **Maintaining professional presence** — posting on LinkedIn, updating portfolios

Most give up after 50 applications because the process is soul-crushing, repetitive, and unscalable. The average job seeker applies to 100+ jobs before landing an interview. That's 100+ hours of manual work.

---

## Our Solution

ify automates the entire job search pipeline with AI agents that work 24/7:

1. **Discover** — Multi-source job scraping across 10+ platforms
2. **Extract** — Parse job details, requirements, and salary data
3. **Score** — AI-powered scoring based on profile match
4. **Apply** — Generate tailored resumes and cover letters
5. **Track** — Gmail inbox integration for application tracking
6. **Brand** — Personal branding swarm for LinkedIn/Instagram content

---

## Key Features

### AI-Powered Job Pipeline

Multi-source job discovery across 10+ platforms with automatic parsing, deduplication, and scoring. Jobs flow through a 4-step pipeline — discover, extract, parse, score — fully automated with zero manual input.

Supported sources: Adzuna, Gradcracker, LinkedIn, UKVisaJobs, Seek, and more.

### Gmail Tracking Inbox

Connect your Gmail via OAuth (powered by Composio) and ify automatically:
- Tracks job application emails
- Extracts sender, company, and subject information
- Surfaces everything in a unified inbox
- No more digging through email threads

### Personal Branding Swarm

A 4-agent AI system that researches your professional presence and generates platform-specific content:

| Agent | What It Analyzes |
|-------|-----------------|
| Profile Agent | Resume, career trajectory, skills |
| GitHub Agent | Repositories, languages, contributions |
| LinkedIn Agent | Posts, connections, engagement |
| Instagram Agent | Public presence, content style |

All findings are synthesized into LinkedIn long-form posts, Instagram captions, and more — with a built-in critic agent that rates content quality before you publish.

### AI Resume Generation

Upload a PDF resume and ify:
1. Parses it deterministically (no LLM required)
2. Extracts structured data: contacts, experience, education, skills
3. Renders it into professionally designed PDFs using Typst, Tectonic LaTeX, or Reactive Resume API
4. All server-side — no browser dependency

### Smart Model Chain

LLM calls never fail. A 7-model fallback chain across 2 providers ensures zero downtime:

**Primary Provider (SumoPod AI):**
1. Qwen 3.7 Flash
2. MiMo v2.5
3. Qwen 3.6 Flash
4. Qwen 3.7 Plus

**Fallback Provider (OpenRouter Free):**
5. Inkling
6. Inkling Small
7. Nemotron 3.5 Lightning

If the primary provider goes down, it transparently falls back to free alternative models — zero cost, zero downtime.

### Social Media Integration

One-click OAuth for LinkedIn, Instagram, and Gmail:
- Publish posts directly from the app
- Track engagement metrics
- Manage your brand from one dashboard
- Built on Composio's v3.1 API with automatic token refresh

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│  Dashboard • Job Pipeline • Gmail Inbox • Post Page      │
└─────────────────────┬───────────────────────────────────┘
                      │ API
┌─────────────────────▼───────────────────────────────────┐
│                   Backend (Express)                      │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Pipeline │  │   LLM    │  │ Social   │              │
│  │  Jobs    │  │ Service  │  │  Media   │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │                    │
│  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐              │
│  │ Extractors│  │ Fallback │  │ Composio │              │
│  │ (scrapes)│  │  Chain   │  │ v3.1 API │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                          │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                    Data Layer                            │
│  SQLite (better-sqlite3) • Composio OAuth               │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Multi-tenant by default** — Every route is tenant-scoped with zero cross-tenant data leakage
- **Correlation IDs** — Every request traced end-to-end through logs and async jobs
- **SSE streaming** — Real-time pipeline updates with no polling
- **Graceful LLM fallback** — Never fails, never costs extra, never exposes API keys
- **Deterministic PDF parsing** — Regex and heuristic parser extracts structured data without LLM

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Tanstack Query, Shadcn UI |
| **Backend** | Express, TypeScript, SQLite (better-sqlite3) |
| **Auth** | OAuth (Google), JWT |
| **Social Media** | Composio v3.1 REST API |
| **PDF Renderers** | Typst, Tectonic LaTeX, Reactive Resume API |
| **LLM** | SumoPod AI + OpenRouter (7-model fallback chain) |
| **Deployment** | Railway (Docker), Vercel (landing page) |
| **CI/CD** | GitHub Actions → GHCR |

---

## How It Works

### 1. Job Discovery Pipeline

```
User triggers pipeline → Extractors run in parallel → Jobs parsed & deduplicated → 
Scored against profile → Results streamed via SSE → Dashboard updates in real-time
```

### 2. Gmail Tracking

```
User connects Gmail via OAuth → Composio manages token refresh → 
Emails fetched & parsed → Application status tracked → Unified inbox view
```

### 3. Personal Branding

```
User enters topic → 4 agents research in parallel → 
Content synthesized → Platform-specific posts generated → 
Critic agent rates quality → User reviews & publishes
```

### 4. Resume Generation

```
User uploads PDF → Deterministic parser extracts structured data → 
Template selected → PDF rendered server-side (Typst/LaTeX) → 
Download ready
```

---

## Getting Started

### Prerequisites

- Node.js 22.22.1 (managed via Volta)
- npm workspaces
- Composio API key (for social media features)
- SumoPod AI API key (or OpenRouter)

### Installation

```bash
# Clone the repository
git clone https://github.com/maulana-tech/ify-app.git
cd ify-app

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run database migrations
npm --workspace orchestrator run db:migrate

# Start development servers
npm --workspace orchestrator run dev
```

### Environment Variables

```env
# LLM Configuration
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://ai.sumopod.com/v1
LLM_API_KEY=sk-your-sumopod-key
MODEL=qwen3.7-flash-2026-07-15

# Fallback Chain
LLM_FALLBACK_MODELS=mimo-v2.5,qwen3.6-flash,qwen3.7-plus
LLM_FALLBACK_PROVIDER=openrouter
LLM_FALLBACK_API_KEY=sk-or-your-openrouter-key
LLM_FALLBACK_PROVIDER_MODELS=thinkingmachines/inkling:free,thinkingmachines/inkling-small:free,nvidia/nemotron-3.5-lightning:free

# Composio (Social Media)
COMPOSIO_API_KEY=your-composio-key

# Database
DATA_DIR=./data
```

---

## API Reference

### Job Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pipeline/start` | Start job discovery pipeline |
| GET | `/api/pipeline/status` | Get pipeline status |
| SSE | `/api/pipeline/stream` | Real-time pipeline updates |

### Social Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/social/connections` | List connected accounts |
| POST | `/api/social/oauth/start` | Start OAuth flow |
| POST | `/api/social/oauth/callback` | Handle OAuth callback |
| POST | `/api/social/publish` | Publish content |

### Gmail

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gmail/emails` | List tracked emails |
| GET | `/api/gmail/status` | Gmail connection status |

### Resume

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/resume/import` | Import PDF resume |
| POST | `/api/resume/render` | Render resume to PDF |

---

## Deployment

### Railway (Production)

```bash
# Build and push Docker image
docker build -t ghcr.io/maulana-tech/ify-app:latest .
docker push ghcr.io/maulana-tech/ify-app:latest

# Deploy to Railway
railway up
```

### Vercel (Landing Page)

```bash
cd landing
npm install
npm run build
vercel deploy
```

---

## Challenges & Learnings

### Challenge 1: LLM Provider Reliability

**Problem:** Single LLM provider failures caused entire features to break.

**Solution:** Built a 7-model fallback chain across 2 providers with automatic failover. Each model is tried in sequence — if one fails, the next is attempted transparently.

### Challenge 2: Social Media API Complexity

**Problem:** Different platforms have different API versions, rate limits, and authentication flows.

**Solution:** Used Composio as a unified abstraction layer. Their v3.1 API handles OAuth, token refresh, and rate limiting across LinkedIn, Instagram, and Gmail.

### Challenge 3: Resume Parsing Accuracy

**Problem:** LLM-based parsing was slow, expensive, and inconsistent.

**Solution:** Built a deterministic parser using regex patterns and heuristic rules. It extracts structured data (contacts, experience, education, skills) without any LLM calls — faster, cheaper, and more reliable.

### Challenge 4: Multi-tenant Data Isolation

**Problem:** Ensuring no cross-tenant data leakage in a shared database.

**Solution:** Every database query includes tenant scope filtering. Every API route resolves tenant context from JWT. Every cache key includes tenant ID.

---

## Future Roadmap

- [ ] **Auto-Apply** — Automatically fill and submit job applications
- [ ] **Analytics Dashboard** — Track application response rates and optimize strategy
- [ ] **Mobile App** — React Native companion for on-the-go job search
- [ ] **More Platforms** — Twitter/X, TikTok, Discord integration
- [ ] **Team Features** — Collaborative job search for career services
- [ ] **AI Interview Prep** — Mock interviews with AI feedback

---

## Team

**Muhammad Maulana Firdaussyah** — Fullstack Developer

- GitHub: [@maulana-tech](https://github.com/maulana-tech)
- LinkedIn: [Muhammad Maulana Firdaussyah](https://linkedin.com/in/maulana-tech)

---

## License

MIT

---

<p align="center">
  Built with ❤️ for job seekers everywhere
</p>
