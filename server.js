require('dotenv').config();
const express = require('express');
const axios = require('axios');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Enable CORS for GitHub Pages and general usage
const allowedOrigins = [
  'https://maxger99.github.io',
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.ALLOWED_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) return callback(null, true);
    // Allow GitHub Pages (with any path)
    if (origin.startsWith('https://maxger99.github.io')) return callback(null, true);
    // Allow configured origins
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true); // Temporarily allow all for debugging
  },
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Fitbit OAuth Configuration
const FITBIT_CLIENT_ID = process.env.FITBIT_CLIENT_ID;
const FITBIT_CLIENT_SECRET = process.env.FITBIT_CLIENT_SECRET;
const FITBIT_REDIRECT_URI = process.env.FITBIT_REDIRECT_URI;

// LLM Configuration (prefer LLM_API_KEY, fallback to GITHUB_TOKEN for GitHub Models)
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.GITHUB_TOKEN;
// Default to GitHub Models inference endpoint if not provided
const LLM_API_URL = process.env.LLM_API_URL || 'https://models.github.ai/inference';
const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o-mini';

// Response persistence (last 500 kept)
const RESPONSES_FILE = path.join(__dirname, 'responses.json');
let responseHistory = [];
try {
  if (fs.existsSync(RESPONSES_FILE)) {
    responseHistory = JSON.parse(fs.readFileSync(RESPONSES_FILE, 'utf-8'));
  }
} catch (e) {
    console.error('Failed to load responses.json:', e.message);
}
function saveResponse(record) {
  responseHistory.push(record);
  // Keep only last 500
  const truncated = responseHistory.slice(-500);
  try {
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(truncated, null, 2));
  } catch (e) {
    console.error('Failed to write responses.json:', e.message);
  }
}
function stripEmojis(text) {
  if (!text) return text;
  return text.replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

// Rate limiting for LLM API calls
let lastLLMCallTime = 0;
const MIN_TIME_BETWEEN_CALLS = Number(process.env.MIN_TIME_BETWEEN_CALLS || 15000); // default 15s between requests (increased for quota conservation)

// Simple FIFO queue to serialize LLM requests
const llmQueue = [];
let llmProcessing = false;

function enqueueLLMTask(taskFn) {
  return new Promise((resolve, reject) => {
    llmQueue.push({ taskFn, resolve, reject });
    processLLMQueue();
  });
}

async function processLLMQueue() {
  if (llmProcessing) return;
  llmProcessing = true;
  try {
    while (llmQueue.length > 0) {
      const { taskFn, resolve, reject } = llmQueue.shift();
      try {
        const result = await taskFn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }
  } finally {
    llmProcessing = false;
  }
}

// Queue status endpoint
app.get('/api/queue/status', (req, res) => {
  res.json({
    queueDepth: llmQueue.length,
    processing: llmProcessing,
    minDelayMs: MIN_TIME_BETWEEN_CALLS
  });
});

async function throttledLLMCall(requestFn) {
  const now = Date.now();
  const timeSinceLastCall = now - lastLLMCallTime;
  
  if (timeSinceLastCall < MIN_TIME_BETWEEN_CALLS) {
    const waitTime = MIN_TIME_BETWEEN_CALLS - timeSinceLastCall;
    console.log(`Throttling: waiting ${waitTime}ms before next API call`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastLLMCallTime = Date.now();
  return await requestFn();
}

// Helper function to make Fitbit API calls
async function callFitbitAPI(endpoint, accessToken) {
  try {
    const response = await axios.get(`https://api.fitbit.com/1/user/-/${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Fitbit API error:', error.response?.data || error.message);
    throw error;
  }
}

// Routes

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initiate Fitbit OAuth
app.get('/auth/fitbit', (req, res) => {
  const scopes = [
    'activity',
    'heartrate',
    'sleep',
    'profile',
    'nutrition',
    'weight'
  ].join('%20');
  
  const authUrl = `https://www.fitbit.com/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${FITBIT_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&` +
    `scope=${scopes}&` +
    `expires_in=31536000`;
  
  res.redirect(authUrl);
});

// Fitbit OAuth callback
app.get('/auth/fitbit/callback', async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.redirect('/?error=no_code');
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://api.fitbit.com/oauth2/token',
      new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: FITBIT_REDIRECT_URI
      }),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Store tokens in session
    req.session.accessToken = tokenResponse.data.access_token;
    req.session.refreshToken = tokenResponse.data.refresh_token;
    req.session.userId = tokenResponse.data.user_id;
    
    res.redirect('/?connected=true');
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    res.redirect('/?error=auth_failed');
  }
});

// Check authentication status
app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: !!req.session.accessToken,
    userId: req.session.userId
  });
});

// Demo data helper
function demoProfile() {
  return {
    user: {
      displayName: 'Demo User',
      fullName: 'Demo User',
      memberSince: new Date(Date.now() - 365*24*60*60*1000).toISOString(),
      avatar: ''
    }
  };
}

function demoActivities() {
  const today = new Date().toISOString().split('T')[0];
  return {
    activities: {
      summary: {
        steps: 7321,
        caloriesOut: 2150,
        fairlyActiveMinutes: 28,
        veryActiveMinutes: 12,
        distances: [{ activity: 'total', distance: 3.85 }]
      },
      goals: {
        steps: 10000,
        activeMinutes: 30
      }
    },
    heart: {
      'activities-heart': [
        { dateTime: today, value: { restingHeartRate: 62 } }
      ]
    },
    sleep: {
      summary: { totalMinutesAsleep: 412 }
    },
    date: today
  };
}

const DEMO_MODE = (process.env.DEMO_MODE === 'true');

// Get Fitbit user profile
app.get('/api/fitbit/profile', async (req, res) => {
  if (DEMO_MODE || !req.session.accessToken) {
    return res.json(demoProfile());
  }
  
  try {
    const profile = await callFitbitAPI('profile.json', req.session.accessToken);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get today's activities
app.get('/api/fitbit/activities', async (req, res) => {
  if (DEMO_MODE || !req.session.accessToken) {
    return res.json(demoActivities());
  }
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch multiple endpoints in parallel
    const [activities, heart, sleep] = await Promise.all([
      callFitbitAPI(`activities/date/${today}.json`, req.session.accessToken),
      callFitbitAPI(`activities/heart/date/${today}/1d.json`, req.session.accessToken).catch(() => null),
      callFitbitAPI(`sleep/date/${today}.json`, req.session.accessToken).catch(() => null)
    ]);
    
    res.json({
      activities: activities,
      heart: heart,
      sleep: sleep,
      date: today
    });
  } catch (error) {
    console.error('Activities fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Get AI coaching based on Fitbit data
app.post('/api/coach', async (req, res) => {
  const { fitbitData, prompt: directPrompt, demo } = req.body || {};
  const useDemo = demo === true || demo === 'true' || process.env.DEMO_MODE === 'true';

  try {
    const prompt = directPrompt && String(directPrompt).trim().length > 0
      ? directPrompt.trim()
      : createCoachingPrompt(
          fitbitData || (useDemo ? demoActivities() : null)
        );

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt or data provided' });
    }

    // Call the LLM API with retry logic for rate limits and throttling
    let llmResponse;
    const queuePosition = llmQueue.length; // snapshot before enqueue
    let retries = 0; // No retries - return fallback immediately on rate limit to conserve quota
    
    while (retries >= 0) {
      try {
        llmResponse = await enqueueLLMTask(async () => {
          return await throttledLLMCall(async () => {
            return await axios.post(
              `${LLM_API_URL}/chat/completions`,
              {
                model: LLM_MODEL,
                messages: [
                  {
                    role: 'system',
                    content: 'You are an enthusiastic and supportive health coach. Provide personalized, encouraging feedback based on the user\'s health data. Be specific, positive, and motivating. Keep responses concise (3-5 sentences).'
                  },
                  { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_completion_tokens: 300
              },
              {
                headers: LLM_API_KEY ? {
                  'Authorization': `Bearer ${LLM_API_KEY}`,
                  'Content-Type': 'application/json',
                  'User-Agent': 'ai-health-tool'
                } : {
                  'Content-Type': 'application/json',
                  'User-Agent': 'ai-health-tool'
                }
              }
            );
          });
        });
        break; // Success, exit retry loop
      } catch (apiError) {
        const status = apiError.response?.status;
        const isRateLimit = status === 429 || (apiError.response?.data?.error && 
          (apiError.response.data.error.includes('Too many requests') || 
           apiError.response.data.error.includes('rate limit')));
        
        if (isRateLimit && retries > 0) {
          const baseDelay = 1000 * (2 ** (3 - retries));
          const jitter = Math.floor(Math.random() * 400);
          const delay = baseDelay + jitter;
          console.log(`Rate limited, retrying in ${Math.ceil(delay/1000)}s (jitter ${jitter}ms)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
        } else {
          throw apiError; // Not rate limit or out of retries
        }
      }
    }

    let coachingMessage = llmResponse.data.choices?.[0]?.message?.content || 'No message generated.';
    coachingMessage = stripEmojis(coachingMessage);
    saveResponse({ timestamp: new Date().toISOString(), prompt, message: coachingMessage });
    res.json({ message: coachingMessage, queuePosition });

  } catch (error) {
    console.error('LLM API error:', error.response?.data || error.message);
    
    // Check if it's a rate limit error
    const isRateLimit = error.response?.status === 429 || 
      (error.response?.data && JSON.stringify(error.response.data).includes('Too many requests'));
    
    if (isRateLimit) {
      console.log('Rate limit exceeded, returning helpful fallback message');
      let fallback = 'Rate limit reached. Try again in a few minutes. Meanwhile, here is a tip: stay consistent with small daily actions - a 10-minute walk, proper hydration, and light stretching can build lasting momentum.';
      fallback = stripEmojis(fallback);
      saveResponse({ timestamp: new Date().toISOString(), prompt, message: fallback, rateLimited: true });
      return res.json({ message: fallback, rateLimited: true });
    }
    
    // If LLM fails, return a graceful demo-friendly message when demo was requested
    if (useDemo) {
      let demoMsg = 'Here is a quick coaching tip while the AI is warming up: keep it consistent today. Add a 10-15 minute walk, hydrate, and wind down with light stretching. Small steps build big momentum - nice work!';
      demoMsg = stripEmojis(demoMsg);
      saveResponse({ timestamp: new Date().toISOString(), prompt, message: demoMsg, demo: true });
      return res.json({ message: demoMsg });
    }
    saveResponse({ timestamp: new Date().toISOString(), prompt, message: 'Failed to get coaching response', error: true });
    res.status(502).json({ error: 'Failed to get coaching response', details: error.message });
  }
});

// Helper function to create coaching prompt
function createCoachingPrompt(data) {
  if (!data) {
    return 'You are a supportive health coach. Provide a brief, encouraging tip tailored for a typical adult to stay active today (3–5 sentences). Include one actionable step and a gentle motivational note.';
  }
  const { activities, heart, sleep } = data;
  
  let prompt = 'Here is the user\'s health data for today:\n\n';
  
  // Steps
  if (activities?.summary?.steps) {
    const steps = activities.summary.steps;
    const stepGoal = activities.goals?.steps || 10000;
    const stepProgress = ((steps / stepGoal) * 100).toFixed(0);
    prompt += `- Steps: ${steps.toLocaleString()} / ${stepGoal.toLocaleString()} (${stepProgress}% of goal)\n`;
  }
  
  // Calories
  if (activities?.summary?.caloriesOut) {
    prompt += `- Calories burned: ${activities.summary.caloriesOut.toLocaleString()}\n`;
  }
  
  // Active minutes
  if (activities?.summary?.fairlyActiveMinutes !== undefined || activities?.summary?.veryActiveMinutes !== undefined) {
    const activeMinutes = (activities.summary.fairlyActiveMinutes || 0) + (activities.summary.veryActiveMinutes || 0);
    prompt += `- Active minutes: ${activeMinutes}\n`;
  }
  
  // Distance
  if (activities?.summary?.distances?.[0]?.distance) {
    const distance = activities.summary.distances[0].distance.toFixed(2);
    prompt += `- Distance: ${distance} miles\n`;
  }
  
  // Heart rate
  if (heart?.['activities-heart']?.[0]?.value?.restingHeartRate) {
    prompt += `- Resting heart rate: ${heart['activities-heart'][0].value.restingHeartRate} bpm\n`;
  }
  
  // Sleep
  if (sleep?.summary?.totalMinutesAsleep) {
    const hours = Math.floor(sleep.summary.totalMinutesAsleep / 60);
    const minutes = sleep.summary.totalMinutesAsleep % 60;
    prompt += `- Sleep: ${hours}h ${minutes}m\n`;
  }
  
  prompt += '\nProvide encouraging and personalized feedback on their progress. Highlight what they\'re doing well and offer gentle motivation for improvement.';
  
  return prompt;
}

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    hasGithubToken: Boolean(process.env.GITHUB_TOKEN),
    llmConfigured: Boolean(LLM_API_URL && LLM_MODEL && LLM_API_KEY)
  });
});

// Recent responses (last 50)
app.get('/api/responses', (req, res) => {
  res.json({ count: responseHistory.length, items: responseHistory.slice(-50) });
});

// Verify GitHub token connectivity (does not expose the token)
app.get('/api/github/check', async (req, res) => {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return res.json({ authenticated: false, tokenPresent: false });
    }

    const ghResp = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'ai-health-tool'
      }
    });

    // Extract scopes from headers if available
    const scopesHeader = ghResp.headers['x-oauth-scopes'] || '';
    const scopes = scopesHeader ? scopesHeader.split(',').map(s => s.trim()).filter(Boolean) : [];

    res.json({
      authenticated: true,
      tokenPresent: true,
      login: ghResp.data?.login,
      scopes
    });
  } catch (err) {
    const status = err.response?.status;
    res.status(200).json({
      authenticated: false,
      tokenPresent: Boolean(process.env.GITHUB_TOKEN),
      error: status === 401 ? 'unauthorized' : 'request_failed',
      status
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Fitbit OAuth redirect: ${FITBIT_REDIRECT_URI}`);
  console.log(`LLM API URL: ${LLM_API_URL}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  const llmConfigured = Boolean(LLM_API_URL && LLM_MODEL && LLM_API_KEY);
  console.log(`🧠 LLM configured: ${llmConfigured ? 'yes' : 'no'} (model: ${LLM_MODEL})`);
});
