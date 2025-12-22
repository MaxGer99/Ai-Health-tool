// Minimal UI logic for simplified homepage
const connectBtn = document.getElementById('connect-btn');
const errorSection = document.getElementById('error-section');
const coachingResponse = document.getElementById('coaching-response');

// API base URL - auto-detect or use environment variable
const API_BASE_URL = (() => {
  // If running on Render, use the current origin
  if (window.location.origin.includes('onrender.com')) {
    return window.location.origin;
  }
  // Otherwise, use the Render backend URL
  return 'https://ai-health-tool-1.onrender.com';
})();

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

function setupEventListeners() {
    // Route to hosted Render app for Fitbit auth
    connectBtn.addEventListener('click', () => {
        window.location.href = 'https://ai-health-tool-1.onrender.com/';
    });

    const submitBtn = document.getElementById('submit-prompt');
    const promptInput = document.getElementById('prompt-input');
    const coachingText = document.getElementById('coaching-text');

    submitBtn.addEventListener('click', async () => {
        const prompt = (promptInput.value || '').trim();
        if (!prompt) {
            showError('Please enter a prompt first.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Thinking...';
        coachingResponse.style.display = 'none';
        errorSection.style.display = 'none';

        try {
            const res = await fetch(`${API_BASE_URL}/api/coach`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ prompt })
            });

            if (!res.ok) {
                const errorText = await res.text().catch(() => 'Unknown error');
                console.error('API Error:', res.status, errorText);
                
                if (res.status === 429 || errorText.includes('Too many requests')) {
                    throw new Error('Rate limited. Please wait a moment and try again.');
                }
                
                try {
                    const errorData = JSON.parse(errorText);
                    throw new Error(errorData.message || `Server error (${res.status})`);
                } catch (e) {
                    throw new Error(`Server error (${res.status}): ${errorText.substring(0, 100)}`);
                }
            }

            const data = await res.json();
            if (data.error) {
                throw new Error(data.error);
            }
            coachingText.textContent = data.message || 'No response from coach.';
            coachingResponse.style.display = 'block';
        } catch (err) {
            console.error('Coaching error:', err);
            showError(err.message || 'Network error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Prompt';
        }
    });
}

function showError(message) {
    errorSection.style.display = 'block';
    document.getElementById('error-message').textContent = message;
    setTimeout(() => {
        errorSection.style.display = 'none';
    }, 4000);
}
