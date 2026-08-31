---
id: post-personal-branding
title: Post — Personal Branding Swarm
description: Swarm agent that researches profile + GitHub + LinkedIn + Instagram via Composio and generates multi-platform post packs.
sidebar_position: 7
---

What it is
Post is a dedicated `/post` page for a personal branding swarm agent. It researches your profile, resume, jobs, GitHub, LinkedIn, and Instagram in parallel, synthesizes a brand context, then generates platform-specific drafts.

Why it exists
Single-source generation (job title only) is not personal. The swarm ensures each post is grounded in your actual activity across all connected accounts, with WORKS coordination (parallel research → synthesize → generate → critic).

How to use it
1. Open **Post** (`/post`) from the sidebar.
2. Connect **LinkedIn / Instagram** in **Settings → Social** and **GitHub** via profile (or Composio when available).
3. In **Create** tab: enter **Topic**, pick **Platforms** (LinkedIn, Instagram, GitHub), choose **Tone** (professional, storytelling, technical, casual, custom), click **Generate**.
4. Review **Research preview** (4 agent cards with confidence + latency) and **Generated packs** (edit, copy, reset).
5. Click **Publish** to post via Composio (`LINKEDIN_CREATE_LINKED_IN_POST`, `INSTAGRAM_CREATE_POST`). GitHub publish copies markdown for now.
6. Check **History** for tenant-scoped past generations and **Connect** for connection status.

Common problems
- **Agent shows `not connected`** — swarm degrades gracefully; generation still runs with available context. Connect the account in Settings and retry.
- **One agent timeout (15s)** — marked `none` confidence; other agents continue. Check `requestId` in logs.
- **LLM token limit** — repos truncated to 3, LinkedIn/IG to 2 items. Try a shorter topic.
- **No generations in history** — ensure you are logged in with same tenant/user; history is tenant-scoped via `getPrivateDataScope()`.

## Related features

- LinkedIn / Instagram (Composio): see **Settings → Social** for setup
- Gmail tracking inbox: see **Tracking Inbox** in app
- Reactive Resume: see **Design Resume** in app
