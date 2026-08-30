# OAuth Setup Guide

This guide walks you through configuring **Google OAuth** and **GitHub OAuth** for the ify app login page.

---

## 1. Google OAuth Setup

### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name (e.g., `ify-app`) and click **Create**

### Step 2: Enable Google+ API
1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for **Google+ API** (or **Google Identity Toolkit API**)
3. Click **Enable**

### Step 3: Configure OAuth Consent Screen
1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (or **Internal** if within a Google Workspace org)
3. Click **Create**
4. Fill in:
   - **App name**: `ify app`
   - **User support email**: your email
   - **Developer contact information**: your email
5. Click **Save and Continue**
6. On **Scopes**, click **Add or Remove Scopes**
   - Select: `openid`, `email`, `profile`
   - Click **Update** → **Save and Continue**
7. On **Test users**, add your email → **Save and Continue**
8. Click **Back to Dashboard**

### Step 4: Create OAuth 2.0 Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Application type**: **Web application**
4. Fill in:
   - **Name**: `ify-app-web`
   - **Authorized redirect URIs**: `http://localhost:5173/api/auth/oauth/google/callback`
     - For production: `https://your-domain.com/api/auth/oauth/google/callback`
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

### Step 5: Add to .env
```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

---

## 2. GitHub OAuth Setup

### Step 1: Create a GitHub OAuth App
1. Go to GitHub → **Settings** → **Developer settings** → **OAuth Apps**
   - Or directly: https://github.com/settings/developers
2. Click **New OAuth App**

### Step 2: Configure the App
Fill in:
- **Application name**: `ify app`
- **Homepage URL**: `http://localhost:5173`
  - For production: `https://your-domain.com`
- **Application description**: (optional)
- **Authorization callback URL**: `http://localhost:5173/api/auth/oauth/github/callback`
  - For production: `https://your-domain.com/api/auth/oauth/github/callback`

Click **Register application**

### Step 3: Generate Client Secret
1. On the app page, click **Generate a new client secret**
2. Copy the **Client ID** and **Client Secret** (shown only once!)

### Step 4: Add to .env
```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

---

## 3. Restart the Server

After updating `.env`, restart the dev server:

```bash
npm --workspace orchestrator run dev
```

The login page will now show **Google** and **GitHub** buttons when configured.

---

## 4. Production Notes

- **Redirect URIs must match exactly** what you configured in Google/GitHub dashboards
- For production, update all `localhost:5173` URLs to your real domain
- Keep `CLIENT_SECRET` values private — never commit them to git
- Consider using a `.env.production` file for production secrets

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` on `/api/auth/oauth/providers` | Make sure `app.ts` auth guard allows public access to OAuth routes (already fixed in this codebase) |
| `redirect_uri_mismatch` | Check that the callback URL in `.env` matches exactly what's configured in Google/GitHub |
| Buttons don't appear | Verify the env vars are loaded (`injected env` count in server logs should include your vars) |
| `OAuth sign-in failed` | Check server logs for the specific error from Google/GitHub token exchange |
