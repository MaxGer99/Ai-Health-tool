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
app.use(express.json({ limit: '1mb' }));
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
    // Build chat messages: inject data context into the system prompt for maximum adherence
    const hasUserPrompt = directPrompt && String(directPrompt).trim().length > 0;
    let promptForHistory = hasUserPrompt ? directPrompt.trim() : (fitbitData ? '(data-only)' : '(no user prompt)');
    const baseSystem = 'You are an enthusiastic and supportive health coach. You MUST use any provided health data directly. NEVER ask the user to provide data that is already given. Do NOT request clarifications about steps, activity, sleep, or heart rate when those values are present. If some categories are missing (e.g., nutrition), proceed with the available data without asking for more. Provide personalized, encouraging feedback based on the user\'s health data. Be specific, positive, and motivating. Keep responses concise (3-5 sentences). Respond in this exact format without any questions or requests: \n\nSummary: <one sentence that cites at least one numeric metric from the data (e.g., average steps, active minutes, sleep hours, resting HR)>.\nPlan: <3–5 short bullet lines or sentences with concrete actions tailored to the data>.\nRecovery: <one sentence on rest/recovery based on the data>.\nMotivation: <one short encouraging sentence>.\n\nDo NOT include questions in your response.';
    const systemContent = baseSystem;
    const dataContext = createCoachingPrompt(fitbitData || (useDemo ? demoActivities() : null));
    const userContent = (hasUserPrompt ? directPrompt.trim() : 'Provide a brief, encouraging coaching tip using the data above.') + '\n\nImportant: Do not ask me to provide any additional data. Use the data above and include at least one numeric metric in your response.';

    // Require either a user prompt, fitbit data, or demo mode
    if (!hasUserPrompt && !fitbitData && !useDemo) {
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
            // Prepare messages array for possible debug logging
            const messages = [
              { role: 'system', content: systemContent },
              { role: 'user', content: 'Data: Week 2025-11-01 → 2025-11-07 • Avg steps 8,200/day • Avg active 45/day • Avg sleep 7.2h • Today 6,300 steps • Avg RHR 66.\nPrompt: Create a weekly plan focused on walking and recovery.' },
              { role: 'assistant', content: 'Summary: With ~8,200 steps/day and 45 active minutes, you\'re on a solid base.\nPlan: Aim for 9,000–10,000 steps on 5 days; add two 20–25 min brisk walks; include 1 light mobility day; target 7+ hours of sleep to support recovery.\nRecovery: Keep RHR steady by spreading effort across the week; finish days with 5–8 min easy stretching.\nMotivation: Great consistency—small daily wins will build into bigger gains.' },
              { role: 'user', content: 'Data: Week 2025-11-10 → 2025-11-16 • Avg steps 6,900/day • Avg active 30/day • Avg sleep 6.4h • Today 5,200 steps • Avg RHR 64.\nPrompt: Suggest a plan (nutrition not available).' },
              { role: 'assistant', content: 'Summary: Averaging ~6,900 steps/day with 30 active minutes and ~6.4h sleep.\nPlan: Add a 15–20 min brisk walk on 4 days; 1 short bodyweight circuit (10–12 min); aim to add 15–30 min total walking across the week to reach ~7,500–8,000/day.\nRecovery: Prioritize a wind-down routine to nudge sleep toward 7+ hours.\nMotivation: You\'re trending up—keep it simple and steady.' },
              { role: 'user', content: dataContext },
              { role: 'user', content: userContent }
            ];

            if (process.env.LLM_DEBUG_LOGGING === 'true') {
              const preview = messages.map((m, i) => ({ role: m.role, content: (m.content || '').slice(0, 400) + ((m.content || '').length > 400 ? '…' : '') }));
              console.log('LLM messages preview:', JSON.stringify(preview, null, 2));
            }

            return await axios.post(
              `${LLM_API_URL}/chat/completions`,
              {
                model: LLM_MODEL,
                messages,
                temperature: 0.0,
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

    // Build a concise data synopsis for the client to display
    const dataSynopsis = buildDataSynopsis(fitbitData);

    let coachingMessage = llmResponse.data.choices?.[0]?.message?.content || 'No message generated.';
    coachingMessage = stripEmojis(coachingMessage);
    saveResponse({ timestamp: new Date().toISOString(), prompt: promptForHistory, message: coachingMessage, dataSynopsis });
    res.json({ message: coachingMessage, queuePosition, dataSynopsis });

  } catch (error) {
    console.error('LLM API error:', error.response?.data || error.message);
    
    // Check if it's a rate limit error
    const isRateLimit = error.response?.status === 429 || 
      (error.response?.data && JSON.stringify(error.response.data).includes('Too many requests'));
    
    if (isRateLimit) {
      console.log('Rate limit exceeded, returning helpful fallback message');
      let fallback = 'Rate limit reached. Try again in a few minutes. Meanwhile, here is a tip: stay consistent with small daily actions - a 10-minute walk, proper hydration, and light stretching can build lasting momentum.';
      fallback = stripEmojis(fallback);
      const dataSynopsis = buildDataSynopsis(fitbitData);
      saveResponse({ timestamp: new Date().toISOString(), prompt: promptForHistory, message: fallback, rateLimited: true, dataSynopsis });
      return res.json({ message: fallback, rateLimited: true, dataSynopsis });
    }
    
    // If LLM fails, return a graceful demo-friendly message when demo was requested
    if (useDemo) {
      let demoMsg = 'Here is a quick coaching tip while the AI is warming up: keep it consistent today. Add a 10-15 minute walk, hydrate, and wind down with light stretching. Small steps build big momentum - nice work!';
      demoMsg = stripEmojis(demoMsg);
      const dataSynopsis = buildDataSynopsis(fitbitData);
      saveResponse({ timestamp: new Date().toISOString(), prompt: promptForHistory, message: demoMsg, demo: true, dataSynopsis });
      return res.json({ message: demoMsg, dataSynopsis });
    }
    saveResponse({ timestamp: new Date().toISOString(), prompt: promptForHistory, message: 'Failed to get coaching response', error: true });
    res.status(502).json({ error: 'Failed to get coaching response', details: error.message });
  }
});

// Helper function to create coaching prompt
function createCoachingPrompt(data) {
  if (!data) {
    return 'You are a supportive health coach. Provide a brief, encouraging tip tailored for a typical adult to stay active today (3–5 sentences). Include one actionable step and a gentle motivational note.';
  }
  const { activities, heart, sleep } = data;

  let prompt = '';
  // If weekly data exists, provide a short weekly summary first
  if (Array.isArray(data.days) && data.days.length) {
    const days = data.days;
    let totalSteps = 0, totalActive = 0, totalSleepMin = 0, rhrSum = 0, rhrCount = 0;
    days.forEach(d => {
      const s = d.activities?.summary || {};
      totalSteps += s.steps || 0;
      totalActive += (s.fairlyActiveMinutes || 0) + (s.veryActiveMinutes || 0);
      const sm = d.sleep?.summary?.totalMinutesAsleep;
      if (typeof sm === 'number') totalSleepMin += sm;
      const rhr = d.heart?.['activities-heart']?.[0]?.value?.restingHeartRate;
      if (typeof rhr === 'number') { rhrSum += rhr; rhrCount++; }
    });
    const avgSteps = Math.round(totalSteps / days.length);
    const avgActive = Math.round(totalActive / days.length);
    const avgSleepHrs = (totalSleepMin / days.length / 60).toFixed(1);
    const avgRHR = rhrCount ? Math.round(rhrSum / rhrCount) : 'n/a';
    prompt += 'Weekly overview (last 7 days):\n';
    prompt += `- Total steps: ${totalSteps.toLocaleString()} (avg ${avgSteps.toLocaleString()}/day)\n`;
    prompt += `- Avg active minutes/day: ${avgActive}\n`;
    prompt += `- Avg sleep/day: ${avgSleepHrs} h\n`;
    if (avgRHR !== 'n/a') prompt += `- Avg resting heart rate: ${avgRHR} bpm\n`;
    prompt += '\nToday\'s details:\n';
  } else {
    prompt += 'Here is the user\'s health data for today:\n\n';
  }
  
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
  } else if (typeof activities?.summary?.distance === 'number') {
    // Some datasets provide a single numeric distance, often in km
    const km = activities.summary.distance.toFixed(2);
    prompt += `- Distance: ${km} km\n`;
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
  
  // Add a compact JSON block to make the data unambiguous for the model
  try {
    const summary = {};
    if (Array.isArray(data.days) && data.days.length) {
      const days = data.days;
      let totalSteps = 0, totalActive = 0, totalSleepMin = 0, rhrSum = 0, rhrCount = 0;
      days.forEach(d => {
        const s = d.activities?.summary || {};
        totalSteps += s.steps || 0;
        totalActive += (s.fairlyActiveMinutes || 0) + (s.veryActiveMinutes || 0);
        const sm = d.sleep?.summary?.totalMinutesAsleep;
        if (typeof sm === 'number') totalSleepMin += sm;
        const rhr = d.heart?.['activities-heart']?.[0]?.value?.restingHeartRate;
        if (typeof rhr === 'number') { rhrSum += rhr; rhrCount++; }
      });
      summary.period = { start: days[0].date, end: days[days.length - 1].date };
      summary.avgStepsPerDay = Math.round(totalSteps / days.length);
      summary.avgActiveMinutesPerDay = Math.round(totalActive / days.length);
      summary.avgSleepHoursPerDay = Number((totalSleepMin / days.length / 60).toFixed(1));
      if (rhrCount) summary.avgRestingHR = Math.round(rhrSum / rhrCount);
    }
    const s = activities?.summary || {};
    const rhr = heart?.['activities-heart']?.[0]?.value?.restingHeartRate;
    const sleepMin = sleep?.summary?.totalMinutesAsleep;
    summary.today = {
      steps: typeof s.steps === 'number' ? s.steps : undefined,
      activeMinutes: (s.fairlyActiveMinutes || 0) + (s.veryActiveMinutes || 0),
      distanceMiles: Array.isArray(s.distances) && s.distances[0]?.distance ? Number(s.distances[0].distance.toFixed(2)) : undefined,
      distanceKm: typeof s.distance === 'number' ? Number(s.distance.toFixed(2)) : undefined,
      caloriesOut: s.caloriesOut,
      restingHR: rhr,
      sleepHours: typeof sleepMin === 'number' ? Number((sleepMin/60).toFixed(1)) : undefined
    };
    const jsonBlock = 'Data (JSON):\n' + '```json\n' + JSON.stringify(summary, null, 2) + '\n```\n';
    prompt += '\n' + jsonBlock;
  } catch (_) { /* ignore */ }

  prompt += '\nProvide encouraging and personalized feedback on their progress. Use the data above directly and do not ask the user to restate it. Highlight what they\'re doing well and offer gentle motivation for improvement.';
  
  return prompt;
}

// Build concise one-line synopsis of data used
function buildDataSynopsis(data) {
  if (!data) return '';
  try {
    if (Array.isArray(data.days) && data.days.length) {
      const days = data.days;
      let totalSteps = 0, totalActive = 0, totalSleepMin = 0, rhrSum = 0, rhrCount = 0;
      days.forEach(d => {
        const s = d.activities?.summary || {};
        totalSteps += s.steps || 0;
        totalActive += (s.fairlyActiveMinutes || 0) + (s.veryActiveMinutes || 0);
        const sm = d.sleep?.summary?.totalMinutesAsleep;
        if (typeof sm === 'number') totalSleepMin += sm;
        const rhr = d.heart?.['activities-heart']?.[0]?.value?.restingHeartRate;
        if (typeof rhr === 'number') { rhrSum += rhr; rhrCount++; }
      });
      const avgSteps = Math.round(totalSteps / days.length).toLocaleString();
      const avgActive = Math.round(totalActive / days.length);
      const avgSleepHrs = (totalSleepMin / days.length / 60).toFixed(1);
      const avgRHR = rhrCount ? Math.round(rhrSum / rhrCount) : null;
      const latest = days[days.length - 1];
      const latestSteps = (latest.activities?.summary?.steps || 0).toLocaleString();
      return `Using 7-day dataset: ${days[0].date} → ${days[days.length - 1].date} • Avg steps ${avgSteps}/day • Avg active ${avgActive}/day • Avg sleep ${avgSleepHrs}h • Today ${latestSteps} steps${avgRHR ? ` • Avg RHR ${avgRHR}` : ''}`;
    }
    const steps = data.activities?.summary?.steps;
    const fairly = data.activities?.summary?.fairlyActiveMinutes || 0;
    const very = data.activities?.summary?.veryActiveMinutes || 0;
    const sleepMin = data.sleep?.summary?.totalMinutesAsleep || data.sleep?.totalMinutesAsleep;
    const sleepHrs = sleepMin ? (sleepMin / 60).toFixed(1) : null;
    const date = data.date || new Date().toISOString().slice(0,10);
    return `Using 1-day dataset: ${date} • Steps ${steps?.toLocaleString?.() || steps || 0} • Active ${fairly + very} •${sleepHrs ? ` Sleep ${sleepHrs}h` : ' Sleep n/a'}`;
  } catch { return ''; }
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
