---
id: social-media
title: Social Media Integration
description: Share job application milestones to LinkedIn and Instagram via Composio.
sidebar_position: 12
---

Connect your LinkedIn or Instagram account to share job-search milestones directly from the app. Posts can be generated with AI, edited, and published in one step — either automatically when you mark a job as applied, or manually from the job detail page.

## What it is

A Composio-powered integration that lets you:

- Connect LinkedIn and/or Instagram once via OAuth (no manual token management).
- Auto-post when you mark a job as applied.
- Manually share any job to a connected platform with AI-generated, editable content.
- Disconnect at any time from Settings.

## Why it exists

Sharing application progress publicly helps build professional visibility, holds you accountable, and often surfaces warm introductions. This feature removes the friction of writing a post from scratch each time.

## How to use it

### 1. Connect a platform

1. Open **Settings → Social Media** (under the Integrations section).
2. Click **Connect LinkedIn** or **Connect Instagram**.
3. You are redirected to Composio to authorize the app.
4. After authorizing, you are redirected back to Settings with the account now shown as connected.

> **Note:** Composio manages the OAuth tokens. You do not need to handle credentials manually.

### 2. Enable auto-post

After connecting, toggle **Auto-post** next to the platform.
When enabled, every time you mark a job as **Applied**, the app automatically generates a post and publishes it using your connected account.

Auto-post is disabled by default.

### 3. Manually share a job

1. Open a job in the detail panel.
2. Go to the **Apply** tab.
3. Click **Share to LinkedIn** or **Share to Instagram** (buttons appear only for connected platforms).
4. In the dialog:
   - Click **Generate with AI** to get a draft based on the job title and company.
   - Edit the text as needed.
   - Check the character counter (LinkedIn: 3,000 / Instagram: 2,200).
   - Click **Post** to publish.

### 4. Disconnect

Go to **Settings → Social Media** and click **Disconnect** next to the platform.
This removes the connection and stops all auto-posts for that platform.

## Common problems

**"Composio is not configured" error**
: The `COMPOSIO_API_KEY` environment variable is not set. Add it to your `.env` file and restart the server.

```bash
COMPOSIO_API_KEY=your_composio_api_key_here
```

**"OAuth connection is not active yet"**
: Composio returns a connection status other than `ACTIVE` after the redirect. This can happen if the authorization was denied or timed out. Try connecting again.

**Share buttons not visible**
: Buttons only appear when a platform is connected. Check **Settings → Social Media** to confirm the connection is active.

**Auto-post fired but no post appeared**
: Check the server logs for `"Auto-post skipped"` entries. Common causes: Composio action name mismatch, expired token (reconnect), or the Composio integration not set up in your Composio dashboard.

**Content exceeds character limit**
: LinkedIn caps posts at 3,000 characters; Instagram captions at 2,200. Edit the content until the counter turns green, then click Post.

## API reference

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/social/connections` | List connected platforms |
| POST | `/api/social/oauth/start` | Start Composio OAuth flow |
| POST | `/api/social/oauth/callback` | Complete OAuth after redirect |
| DELETE | `/api/social/connections/:platform` | Disconnect a platform |
| PATCH | `/api/social/connections/:platform/auto-post` | Toggle auto-post |
| POST | `/api/social/generate` | Generate AI post content |
| POST | `/api/social/post` | Publish a post |

## Related pages

- [Settings](/docs/next/features/settings) — where to connect and configure integrations.
- [Pipeline Run](/docs/next/features/pipeline-run) — runs the job discovery pipeline; auto-post fires during the apply step.
- [Post-Application Tracking](/docs/next/features/post-application-tracking) — tracks email responses after applying.
