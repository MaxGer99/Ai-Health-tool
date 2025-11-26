# Connecting GitHub Models to Render

This guide walks you through deploying your AI Health Tool to Render with GitHub Models for free LLM inference.

## Prerequisites

1. **GitHub Account** with access to [GitHub Models](https://github.com/marketplace/models)
2. **Render Account** (free tier works perfectly)
3. **Fitbit Developer App** configured with OAuth credentials

## Step 1: Create GitHub Personal Access Token

1. Go to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (fine-grained)"
3. Configure the token:
   - **Name**: `AI Health Tool - Models Access`
   - **Expiration**: 90 days (or custom)
   - **Repository access**: All repositories (or select specific repo)
   - **Permissions**: 
     - Under "Account permissions" → **Models**: Read access ✅
4. Click "Generate token" and **copy it immediately** (you won't see it again)

## Step 2: Deploy to Render

### Option A: Via Dashboard (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository (`Ai-Health-tool`)
4. Configure the service:
   - **Name**: `ai-health-tool` (or your choice)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free

### Option B: Via render.yaml (Already configured)

If you have `render.yaml` in your repo, Render will auto-detect it:

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Blueprint"
3. Select your repository
4. Render will read `render.yaml` and create the service

## Step 3: Configure Environment Variables

In your Render service dashboard → Environment:

### Required Variables

```bash
# Node Environment
NODE_ENV=production
PORT=10000

# Session Security
SESSION_SECRET=<generate-random-string-here>

# Fitbit OAuth
FITBIT_CLIENT_ID=your_fitbit_client_id
FITBIT_CLIENT_SECRET=your_fitbit_client_secret
FITBIT_REDIRECT_URI=https://your-app-name.onrender.com/auth/fitbit/callback

# GitHub Models Configuration (FREE!)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LLM_API_URL=https://models.github.ai/inference
LLM_MODEL=openai/gpt-5
```

### Model Options

Choose from [GitHub Models catalog](https://github.com/marketplace/models):

| Model | ID | Best For |
|-------|-----|----------|
| GPT-5 | `openai/gpt-5` | Latest generation (requires access) |
| GPT-4o | `openai/gpt-4o` | Advanced reasoning |
| GPT-4o mini | `openai/gpt-4o-mini` | Fast, efficient |
| Llama 3.1 405B | `meta/llama-3.1-405b-instruct` | Large open model |
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` | Long context |

### Optional Variables

```bash
# Enable demo mode for testing without Fitbit
DEMO_MODE=true

# CORS (if using custom domain)
ALLOWED_ORIGIN=https://yourdomain.com
```

## Step 4: Update Fitbit Redirect URI

1. Go to [Fitbit Developer Portal](https://dev.fitbit.com/apps)
2. Edit your application
3. Update **Callback URL** to: `https://your-app-name.onrender.com/auth/fitbit/callback`
4. Save changes

## Step 5: Deploy & Test

1. Click "Manual Deploy" → "Deploy latest commit" (or push to trigger auto-deploy)
2. Wait for build to complete (~2-3 minutes)
3. Visit your app: `https://your-app-name.onrender.com`
4. Test endpoints:

```bash
# Health check
curl https://your-app-name.onrender.com/health

# Expected response:
{
  "status": "ok",
  "env": "production",
  "hasGithubToken": true,
  "llmConfigured": true
}
```

```bash
# Test coaching endpoint (demo mode)
curl -X POST https://your-app-name.onrender.com/api/coach \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Give me a health tip", "demo": true}'
```

## Troubleshooting

### "LLM API error"
- Verify `GITHUB_TOKEN` is set correctly in Render environment
- Check token has `models` permission
- Ensure `LLM_API_URL=https://models.github.ai/inference` (no trailing slash)
- Token may be expired - generate a new one

### "Not allowed by CORS"
- Add your GitHub Pages URL to `ALLOWED_ORIGIN` if using custom domain
- Default allows `https://maxger99.github.io`

### "Failed to get coaching response"
- Check Render logs: Dashboard → Logs
- Verify all environment variables are set
- Test with demo mode: add `"demo": true` to request body

### Token Rate Limits
- GitHub Models has rate limits (check [docs](https://docs.github.com/en/github-models))
- Free tier: reasonable limits for personal projects
- Consider caching responses for repeated queries

## Cost Breakdown

| Service | Cost |
|---------|------|
| Render (Free tier) | $0/month |
| GitHub Models | $0/month (free inference) |
| Fitbit API | $0/month (free for personal use) |
| **Total** | **$0/month** 🎉 |

## Security Notes

1. **Never commit tokens** - `.gitignore` already protects `.env`
2. **Rotate tokens** if accidentally exposed
3. **Use fine-grained PATs** with minimal scopes
4. **Enable HTTPS only** (Render provides free SSL)
5. **Set strong SESSION_SECRET** - use `openssl rand -hex 32`

## Next Steps

- [Configure GitHub Actions](./README.md#github-models-workflow) for scheduled health tips
- [Create custom prompts](./health-coach.prompt.yml) for evaluations
- [Monitor usage](https://github.com/settings/billing) in GitHub billing

## Support

- Render: https://render.com/docs
- GitHub Models: https://docs.github.com/en/github-models
- Fitbit API: https://dev.fitbit.com/build/reference/

---

**Need help?** Open an issue in the repository or check the [main README](./README.md).
