# Fitbit Health Coach

A web application that connects to Fitbit to fetch your health data and uses GitHub Models (or any OpenAI-compatible LLM) to provide personalized AI-powered health coaching.

## Quick Start

### Deploy to Render (Backend)

1. Sign up at [Render.com](https://render.com)
2. Connect your GitHub repository
3. Set environment variables:
   ```
   NODE_ENV=production
   PORT=10000
   FITBIT_CLIENT_ID=your_fitbit_client_id
   FITBIT_CLIENT_SECRET=your_fitbit_client_secret
   FITBIT_REDIRECT_URI=https://your-app-name.onrender.com/auth/fitbit/callback
   SESSION_SECRET=generate_random_string
   GITHUB_TOKEN=your_github_pat
   LLM_API_URL=https://models.inference.ai.azure.com
   LLM_MODEL=gpt-4o-mini
   ```
4. Deploy and visit your live app at `https://your-app-name.onrender.com`

### Deploy to GitHub Pages (Frontend)

1. Go to your GitHub repo Settings → Pages
2. Set source to "Deploy from a branch"
3. Select branch: `main` and folder: `/docs`
4. Save and wait for deployment
5. Visit your app at `https://<username>.github.io/<repo-name>/`

**Note:** GitHub Pages serves the static frontend from `docs/`, which makes API calls to your Render backend. The backend must be deployed first.

### Run Locally

1. Install dependencies: `npm install`
2. Create `.env` with your Fitbit credentials and LLM configuration
3. Run: `npm start` (or `npm run dev` for development)
4. Visit http://localhost:3001

## Setup: Fitbit OAuth

1. Go to [Fitbit Developer Portal](https://dev.fitbit.com/apps)
2. Register a new app with callback: `http://localhost:3001/auth/fitbit/callback`
3. Copy Client ID and Client Secret to your `.env`

## Setup: GitHub Models (Recommended)

1. Create a fine-grained PAT with "Models" scope at [GitHub Tokens](https://github.com/settings/tokens)
2. Set `GITHUB_TOKEN` in your environment
3. LLM is now ready to use (free inference)

**Alternative LLM providers:**
- Set `LLM_API_URL` and `LLM_API_KEY` for any OpenAI-compatible API

## Features

- Connect with Fitbit OAuth
- View real-time health metrics (steps, heart rate, sleep, activities)
- Get AI-powered personalized health coaching
- Secure session-based authentication

## API Endpoints

- `GET /health` - Health check (returns config status)
- `GET /auth/fitbit` - Initiate Fitbit OAuth
- `GET /api/fitbit/activities` - Fetch today's data
- `POST /api/coach` - Get AI coaching response
- `GET /api/history` - View response history (last 50)
- `GET /api/queue/status` - LLM queue depth

## Environment Variables

```
FITBIT_CLIENT_ID          # Fitbit OAuth credentials
FITBIT_CLIENT_SECRET
FITBIT_REDIRECT_URI
SESSION_SECRET            # Random string for sessions
GITHUB_TOKEN              # GitHub PAT (for GitHub Models)
LLM_API_URL              # LLM endpoint (default: GitHub Models)
LLM_MODEL                # Model name (default: openai/gpt-4o-mini)
LLM_API_KEY              # For alternative LLM providers
NODE_ENV                 # production or development
PORT                     # Server port (default: 3001)
```

## Troubleshooting

- **AI coaching shows fallback message**: GitHub Models API may be unreachable or misconfigured. The app returns a helpful fallback message instead of failing.
- **Unauthorized LLM error**: Verify `GITHUB_TOKEN` is set and has "models" scope at [github.com/settings/tokens](https://github.com/settings/tokens)
- **Fitbit auth fails**: Check callback URL matches exactly in Fitbit app settings
- **CORS issues**: Ensure you're visiting the app at its actual URL, not a different origin

## License

MIT
