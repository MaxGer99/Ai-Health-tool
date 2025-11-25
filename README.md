# Fitbit Health Coach

A web application that integrates with Fitbit API to fetch your health data and uses a personal LLM to provide personalized health coaching and encouragement.

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

## License

MIT
