# Deploying to Render.com

This guide will help you deploy your Fitbit Health Coach application to Render's free tier.

## Prerequisites

1. GitHub account (already set up ✅)
2. [Render account](https://render.com) (free)
3. Your Fitbit API credentials
4. LLM API endpoint (can be a public URL or another hosted service)
5. No secrets committed to git — use Render environment variables

## Step 1: Prepare Your Fitbit App

1. Go to [Fitbit Developer Portal](https://dev.fitbit.com/apps)
2. Edit your application
3. Add a new **Callback URL**: `https://your-app-name.onrender.com/auth/fitbit/callback`
   - Replace `your-app-name` with your chosen Render service name
   - Keep the localhost URL for local development
4. Save changes

## Step 2: Deploy to Render

### Option A: Deploy via Dashboard (Easiest)

1. **Sign up/Login to Render**
   - Go to https://render.com
   - Sign up with GitHub (recommended)

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `MaxGer99/Ai-Health-tool`
   - Authorize Render to access your repository

3. **Configure the Service**
   - **Name**: `fitbit-health-coach` (or your choice)
   - **Region**: Oregon (or closest to you)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

4. **Add Environment Variables**
   Click "Advanced" → "Add Environment Variable" for each:

   ```
   NODE_ENV = production
   PORT = 10000
   FITBIT_CLIENT_ID = your_fitbit_client_id
   FITBIT_CLIENT_SECRET = your_fitbit_client_secret
   FITBIT_REDIRECT_URI = https://your-app-name.onrender.com/auth/fitbit/callback
   SESSION_SECRET = (click "Generate" button)
   LLM_API_URL = your_llm_api_url
   LLM_API_KEY = your_llm_api_key (if needed)
   LLM_MODEL = local-model
   ```
   Do not commit these values to the repository. Keep secrets only in Render.

5. **Deploy**
   - Click "Create Web Service"
   - Wait 2-3 minutes for deployment
   - Your app will be at: `https://your-app-name.onrender.com`

### Option B: Deploy via Blueprint (Automatic)

1. **Login to Render**
2. **New Blueprint Instance**
   - Click "New +" → "Blueprint"
   - Connect repository: `MaxGer99/Ai-Health-tool`
   - Render will detect `render.yaml` automatically
3. **Add Environment Variables** (same as Option A)
4. **Deploy**

## Step 3: Update Fitbit Callback URL

1. Go back to [Fitbit Developer Portal](https://dev.fitbit.com/apps)
2. Edit your app settings
3. Ensure callback URL matches: `https://your-actual-render-url.onrender.com/auth/fitbit/callback`

## Step 4: Configure LLM Access

### If using a local LLM:

Your local LLM won't be accessible from Render. Consider these options:

1. **Use a cloud LLM service:**
   - OpenAI API
   - Anthropic Claude API
   - Together.ai (cheap)
   - Groq (fast and free tier)

2. **Host your own LLM:**
   - Replicate.com
   - Hugging Face Inference Endpoints
   - Modal.com

3. **Expose local LLM (not recommended for production):**
   - Use ngrok or similar to expose localhost
   - Not secure or reliable for production

### Recommended: Use Groq (Free & Fast)

1. Sign up at https://console.groq.com
2. Get API key
3. Update environment variables:
   ```
   LLM_API_URL = https://api.groq.com/openai/v1
   LLM_API_KEY = your_groq_api_key
   LLM_MODEL = llama-3.1-70b-versatile
   ```

## Important Notes

### Free Tier Limitations

- **Spins down after 15 minutes of inactivity**
- First request after spin-down takes ~30 seconds
- 750 hours/month free (enough for most personal projects)
- Automatic HTTPS included

### Keeping Service Awake (Optional)

Add this service to ping your app every 14 minutes:
- [Cron-job.org](https://cron-job.org)
- [UptimeRobot](https://uptimerobot.com)

Configure to ping: `https://your-app-name.onrender.com/api/auth/status`

## Security & Secrets Management

- `.env` is ignored by git in this repo; use `.env.example` as a template locally.
- For production, configure secrets only via Render's **Environment** settings.
- Never commit API keys, client secrets, or session secrets.

## Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility

### App Crashes
- Check logs in Render dashboard
- Verify all environment variables are set
- Test LLM API endpoint separately

### OAuth Errors
- Double-check callback URL matches exactly
- Ensure HTTPS (not HTTP)
- Verify Fitbit credentials are correct

### LLM Not Working
- Test LLM API endpoint with curl
- Check API key is valid
- Verify URL format is correct

### IP Allowlist (Render Connect)
If your upstream services (LLM provider, databases, firewalls, or APIs) require IP allowlisting, add Render's outbound CIDR ranges:

```
74.220.50.0/24
74.220.58.0/24
```

Notes:
- These are egress IP ranges used by Render; inbound IPs to your web service are managed by Render and may change.
- Fitbit OAuth requires an HTTPS callback URL and does not support IP-based callbacks. Use:
   `https://your-app-name.onrender.com/auth/fitbit/callback`.

## Testing Your Deployment

1. Visit `https://your-app-name.onrender.com`
2. Click "Connect with Fitbit"
3. Authorize the app
4. View your health data
5. Test "Get Coaching" button

## Monitoring

- **Logs**: Render Dashboard → Your Service → Logs
- **Metrics**: Dashboard shows CPU, memory usage
- **Uptime**: Free tier shows service status

## Updating Your App

Render automatically deploys when you push to GitHub:

```bash
git add .
git commit -m "Update feature"
git push origin main
```

Render will detect changes and redeploy automatically!

## Cost Breakdown

- **Render Web Service**: Free (750 hours/month)
- **Domain**: Free (.onrender.com subdomain)
- **HTTPS**: Free (automatic)
- **LLM**: Depends on provider
  - Groq: Free tier available
  - OpenAI: Pay per use
  - Together.ai: $0.20/1M tokens

## Need Help?

- Render Docs: https://render.com/docs
- Render Community: https://community.render.com
- Your deployment logs: Render Dashboard → Logs
