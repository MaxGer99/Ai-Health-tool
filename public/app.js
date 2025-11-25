// Global state
let isAuthenticated = false;
let currentFitbitData = null;

// DOM elements
const authSection = document.getElementById('auth-section');
const notConnected = document.getElementById('not-connected');
const connected = document.getElementById('connected');
const connectBtn = document.getElementById('connect-btn');
const logoutBtn = document.getElementById('logout-btn');
const loading = document.getElementById('loading');
const profileSection = document.getElementById('profile-section');
const dataSection = document.getElementById('data-section');
const errorSection = document.getElementById('error-section');
const getCoachingBtn = document.getElementById('get-coaching-btn');
const coachingResponse = document.getElementById('coaching-response');

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    checkUrlParams();
    await checkAuthStatus();
    setupEventListeners();
});

// Check URL parameters for connection status or errors
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('connected') === 'true') {
        showSuccess('Successfully connected to Fitbit!');
        // Clean URL
        window.history.replaceState({}, document.title, '/');
    }
    
    if (urlParams.get('error')) {
        const errorType = urlParams.get('error');
        const errorMessages = {
            'no_code': 'Authorization failed: No code received',
            'auth_failed': 'Failed to authenticate with Fitbit'
        };
        showError(errorMessages[errorType] || 'An error occurred');
        window.history.replaceState({}, document.title, '/');
    }
}

// Check authentication status
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        isAuthenticated = data.authenticated;
        
        if (isAuthenticated) {
            showConnected();
            await loadUserData();
        } else {
            showNotConnected();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showNotConnected();
    }
}

// Setup event listeners
function setupEventListeners() {
    connectBtn.addEventListener('click', () => {
        window.location.href = '/auth/fitbit';
    });
    
    logoutBtn.addEventListener('click', logout);
    getCoachingBtn.addEventListener('click', getCoaching);
}

// Show/hide UI states
function showNotConnected() {
    notConnected.style.display = 'block';
    connected.style.display = 'none';
    profileSection.style.display = 'none';
    dataSection.style.display = 'none';
}

function showConnected() {
    notConnected.style.display = 'none';
    connected.style.display = 'block';
}

function showLoading(show = true) {
    loading.style.display = show ? 'block' : 'none';
}

// Load user data from Fitbit
async function loadUserData() {
    showLoading(true);
    
    try {
        // Fetch profile and activities in parallel
        const [profileResponse, activitiesResponse] = await Promise.all([
            fetch('/api/fitbit/profile'),
            fetch('/api/fitbit/activities')
        ]);
        
        if (!profileResponse.ok || !activitiesResponse.ok) {
            throw new Error('Failed to fetch data');
        }
        
        const profile = await profileResponse.json();
        const activities = await activitiesResponse.json();
        
        currentFitbitData = activities;
        
        displayProfile(profile);
        displayActivities(activities);
        
        profileSection.style.display = 'block';
        dataSection.style.display = 'block';
        
    } catch (error) {
        console.error('Load data error:', error);
        showError('Failed to load Fitbit data. Please try reconnecting.');
    } finally {
        showLoading(false);
    }
}

// Display user profile
function displayProfile(data) {
    const profile = data.user;
    document.getElementById('user-name').textContent = profile.displayName || profile.fullName;
    
    const profileInfo = document.getElementById('profile-info');
    profileInfo.innerHTML = `
        <p><strong>Member since:</strong> ${new Date(profile.memberSince).toLocaleDateString()}</p>
        ${profile.avatar ? `<img src="${profile.avatar}" alt="Profile" style="width: 60px; height: 60px; border-radius: 50%; margin-top: 10px;">` : ''}
    `;
}

// Display activities
function displayActivities(data) {
    const activityStats = document.getElementById('activity-stats');
    const { activities, heart, sleep } = data;
    
    let statsHTML = '';
    
    // Steps
    if (activities?.summary?.steps !== undefined) {
        const steps = activities.summary.steps;
        const stepGoal = activities.goals?.steps || 10000;
        const progress = Math.min((steps / stepGoal) * 100, 100);
        
        statsHTML += `
            <div class="stat-card">
                <h3>👣 Steps</h3>
                <div class="stat-value">${steps.toLocaleString()}</div>
                <div class="stat-subtext">Goal: ${stepGoal.toLocaleString()}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        `;
    }
    
    // Calories
    if (activities?.summary?.caloriesOut) {
        statsHTML += `
            <div class="stat-card">
                <h3>🔥 Calories</h3>
                <div class="stat-value">${activities.summary.caloriesOut.toLocaleString()}</div>
                <div class="stat-subtext">Burned today</div>
            </div>
        `;
    }
    
    // Active Minutes
    if (activities?.summary) {
        const activeMinutes = (activities.summary.fairlyActiveMinutes || 0) + 
                             (activities.summary.veryActiveMinutes || 0);
        const activeGoal = activities.goals?.activeMinutes || 30;
        const progress = Math.min((activeMinutes / activeGoal) * 100, 100);
        
        statsHTML += `
            <div class="stat-card">
                <h3>⚡ Active Minutes</h3>
                <div class="stat-value">${activeMinutes}</div>
                <div class="stat-subtext">Goal: ${activeGoal}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        `;
    }
    
    // Distance
    if (activities?.summary?.distances?.[0]?.distance) {
        const distance = activities.summary.distances[0].distance.toFixed(2);
        statsHTML += `
            <div class="stat-card">
                <h3>📍 Distance</h3>
                <div class="stat-value">${distance}</div>
                <div class="stat-subtext">miles</div>
            </div>
        `;
    }
    
    // Heart Rate
    if (heart?.['activities-heart']?.[0]?.value?.restingHeartRate) {
        const rhr = heart['activities-heart'][0].value.restingHeartRate;
        statsHTML += `
            <div class="stat-card">
                <h3>❤️ Resting HR</h3>
                <div class="stat-value">${rhr}</div>
                <div class="stat-subtext">bpm</div>
            </div>
        `;
    }
    
    // Sleep
    if (sleep?.summary?.totalMinutesAsleep) {
        const totalMinutes = sleep.summary.totalMinutesAsleep;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        statsHTML += `
            <div class="stat-card">
                <h3>😴 Sleep</h3>
                <div class="stat-value">${hours}h ${minutes}m</div>
                <div class="stat-subtext">Last night</div>
            </div>
        `;
    }
    
    activityStats.innerHTML = statsHTML || '<p>No activity data available for today.</p>';
}

// Get AI coaching
async function getCoaching() {
    if (!currentFitbitData) {
        showError('No Fitbit data available');
        return;
    }
    
    getCoachingBtn.disabled = true;
    getCoachingBtn.textContent = 'Generating coaching...';
    coachingResponse.style.display = 'none';
    
    try {
        const response = await fetch('/api/coach', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fitbitData: currentFitbitData
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to get coaching response');
        }
        
        const data = await response.json();
        
        document.getElementById('coaching-text').textContent = data.message;
        coachingResponse.style.display = 'block';
        
    } catch (error) {
        console.error('Coaching error:', error);
        showError('Failed to get coaching. Make sure your LLM server is running.');
    } finally {
        getCoachingBtn.disabled = false;
        getCoachingBtn.textContent = 'Get Coaching';
    }
}

// Logout
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        isAuthenticated = false;
        currentFitbitData = null;
        showNotConnected();
        showSuccess('Logged out successfully');
    } catch (error) {
        console.error('Logout error:', error);
        showError('Failed to logout');
    }
}

// Utility functions
function showError(message) {
    errorSection.style.display = 'block';
    document.getElementById('error-message').textContent = message;
    setTimeout(() => {
        errorSection.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    // You could implement a success notification here
    console.log('Success:', message);
}
