# Fitbit Health Coach

A web application that integrates with Fitbit API to fetch your health data and uses a personal LLM to provide personalized health coaching and encouragement.

## 📖 Documentation

**[View Full Documentation on GitHub Pages](https://maxger99.github.io/Ai-Health-tool/)**

> **Note:** This is a full-stack application that requires a backend server. GitHub Pages only hosts the documentation.

## 🚀 Deployment Options

### Option 1: Deploy to Render (Recommended - Free)
See **[RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)** for complete deployment instructions.

Quick steps:
1. Sign up at [Render.com](https://render.com)
2. Connect your GitHub repository
3. Add environment variables
4. Deploy! Your app will be live at `https://your-app-name.onrender.com`

Environment variables to set on Render:
```
NODE_ENV=production
PORT=10000
FITBIT_CLIENT_ID=your_fitbit_client_id
FITBIT_CLIENT_SECRET=your_fitbit_client_secret
FITBIT_REDIRECT_URI=https://your-app-name.onrender.com/auth/fitbit/callback
SESSION_SECRET=<generate a random string>
LLM_API_URL=https://api.groq.com/openai/v1 (or your chosen LLM)
LLM_API_KEY=your_llm_api_key
LLM_MODEL=llama-3.1-70b-versatile (or your chosen model)
```

If your upstream services require IP allowlisting (e.g., managed databases or LLM providers), add Render's outbound ranges:

```
74.220.50.0/24
74.220.58.0/24
```

Fitbit OAuth requires an HTTPS callback URL (no IP-based callbacks). Set:
`FITBIT_REDIRECT_URI=https://your-app-name.onrender.com/auth/fitbit/callback`

### Option 2: Run Locally
Follow the setup instructions below to run on your local machine.

## 🔒 Secrets & Environment Variables

Sensitive values (API keys, client secrets) must NOT be committed to git. This repo already ignores `.env` via `.gitignore`.

- Create your local env file:
   ```
   cp .env.example .env
   ```
   Edit `.env` with your real values. Do not commit this file.

- For Render (production), use Render's dashboard to set env vars — never commit secrets:
   - `FITBIT_CLIENT_ID`
   - `FITBIT_CLIENT_SECRET`
   - `FITBIT_REDIRECT_URI`
   - `SESSION_SECRET`
   - `LLM_API_URL`
   - `LLM_API_KEY`
   - `LLM_MODEL`
   - `GITHUB_TOKEN` (or use `LLM_API_KEY`) for GitHub Models inference

Best practices:
- Keep `.env` files out of git (already configured)
- Use different secrets for dev vs prod
- Rotate keys if accidentally committed

## Features

- 🏃‍♂️ Fetch real-time data from Fitbit (steps, heart rate, sleep, calories, activities)
- 🤖 AI-powered health coaching using a local LLM
- 💬 Personalized encouragement based on your goals and progress
- 📊 Visual display of your health metrics
- 🔒 Secure OAuth2 authentication with Fitbit

## Prerequisites

- Node.js (v16 or higher)
- A Fitbit account and registered application
- A local LLM server (e.g., LM Studio, Ollama, or any OpenAI-compatible API)

## Setup Instructions

### 1. Fitbit API Setup

1. Go to [Fitbit Developer Portal](https://dev.fitbit.com/apps)
2. Click "Register An App"
3. Fill in the application details:
   - **Application Name**: Your app name
   - **Description**: Health coaching app
   - **Application Website**: http://localhost:3001
   - **Organization**: Your name/organization
   - **OAuth 2.0 Application Type**: Personal
   - **Callback URL**: http://localhost:3001/auth/fitbit/callback
   - **Default Access Type**: Read Only
4. Note your **Client ID** and **Client Secret**

### 2. Local LLM Setup

Choose one of these options:

**Option A: LM Studio**
1. Download [LM Studio](https://lmstudio.ai/)
2. Load a model (recommended: Llama 3.1 or Mistral)
3. Start the local server (default: http://localhost:1234)

**Option B: Ollama**
1. Install [Ollama](https://ollama.ai/)
2. Run: `ollama run llama3.1`
3. The API will be at http://localhost:11434

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- Add your Fitbit Client ID and Secret
- Configure your LLM API URL and key (if required)

### 5. Run the Application

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Visit http://localhost:3001 in your browser.

## Usage

1. Click "Connect with Fitbit" to authorize the app
2. Once connected, your health data will be displayed
3. Click "Get AI Coaching" to receive personalized encouragement
4. The AI coach will analyze your data and provide motivational feedback

## API Endpoints

- `GET /` - Home page
- `GET /auth/fitbit` - Initiate Fitbit OAuth
- `GET /auth/fitbit/callback` - Fitbit OAuth callback
- `GET /api/fitbit/profile` - Get user profile
- `GET /api/fitbit/activities` - Get today's activities
- `POST /api/coach` - Get AI coaching based on Fitbit data

## Project Structure

```
.
├── server.js           # Express server and API routes
├── public/
│   ├── index.html     # Frontend UI
│   ├── styles.css     # Styling
│   └── app.js         # Frontend JavaScript
├── .env               # Environment variables (not in git)
└── package.json       # Dependencies
```

## Troubleshooting

- **Fitbit OAuth error**: Check your callback URL matches exactly
- **LLM not responding**: Ensure your local LLM server is running
- **CORS issues**: Make sure CORS is enabled in server.js

## GitHub Models Workflow

This repo includes `/.github/workflows/models-inference.yml` to call GitHub Models (GPT-5):

- Triggers: manual (`workflow_dispatch`) and daily at 13:00 UTC (`schedule`).
- Auth: Uses `GH_MODELS_TOKEN` (if present) or falls back to `GITHUB_TOKEN`.
- Output: Logs the model reply and uploads `response.json` as an artifact (`models-response`).

### Setup

- Create a fine‑grained PAT with “Models (inference)” permission.
- Add it as a repository secret named `GH_MODELS_TOKEN`:
  - Repo → Settings → Secrets and variables → Actions → New secret → `GH_MODELS_TOKEN`

### Run

- Manual: GitHub → Actions → "GitHub Models Inference Demo" → Run workflow → enter `prompt`.
- Scheduled: Wait for daily run; view logs and download artifact.

## Reusable Prompt Files

This repo includes `health-coach.prompt.yml`, a reusable prompt for health coaching based on Fitbit data:

- View and run in GitHub: Repo → Models tab → Prompts → `health-coach.prompt.yml`
- Edit mode: Test with custom input via the prompt editor.
- Compare mode: Run evaluations with test data to compare model responses.
- Evaluations: Validates that responses are encouraging, data-specific, and similar to expected coaching advice.

To create more prompts, add `.prompt.yml` files anywhere in your repo. See [Storing prompts in GitHub repositories](https://docs.github.com/en/github-models/use-github-models/storing-prompts-in-github-repositories) for details.

## GitHub Pages Deployment

This project is configured for GitHub Pages deployment:

1. **Enable GitHub Pages:**
   - Go to your repository settings
   - Navigate to "Pages" section
   - Select source: "GitHub Actions"

2. **Automatic Deployment:**
   - Push to `main` branch triggers automatic deployment
   - The workflow builds and deploys the documentation site
   - Access your site at: `https://maxger99.github.io/Ai-Health-tool/`

3. **Documentation Site:**
   - The documentation page provides setup instructions and API details
   - Note: The actual application requires a backend server and cannot run on GitHub Pages

## License

MIT
