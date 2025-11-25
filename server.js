require('dotenv').config();
const express = require('express');
const axios = require('axios');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
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

// LLM Configuration
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_API_URL = process.env.LLM_API_URL || 'http://localhost:1234/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'local-model';

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

// Get Fitbit user profile
app.get('/api/fitbit/profile', async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
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
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
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
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const { fitbitData } = req.body;
    
    // Prepare the prompt for the LLM
    const prompt = createCoachingPrompt(fitbitData);
    
    // Call the LLM API
    const llmResponse = await axios.post(
      `${LLM_API_URL}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an enthusiastic and supportive health coach. Provide personalized, encouraging feedback based on the user\'s health data. Be specific, positive, and motivating. Keep responses concise (3-5 sentences).'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      },
      {
        headers: LLM_API_KEY ? {
          'Authorization': `Bearer ${LLM_API_KEY}`,
          'Content-Type': 'application/json'
        } : {
          'Content-Type': 'application/json'
        }
      }
    );
    
    const coachingMessage = llmResponse.data.choices[0].message.content;
    res.json({ message: coachingMessage });
    
  } catch (error) {
    console.error('LLM API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get coaching response',
      details: error.message 
    });
  }
});

// Helper function to create coaching prompt
function createCoachingPrompt(data) {
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Fitbit OAuth redirect: ${FITBIT_REDIRECT_URI}`);
  console.log(`🤖 LLM API URL: ${LLM_API_URL}`);
});
