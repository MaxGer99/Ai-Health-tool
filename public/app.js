// Minimal UI logic for simplified homepage
const connectBtn = document.getElementById('connect-btn');
const errorSection = document.getElementById('error-section');
const coachingResponse = document.getElementById('coaching-response');

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
        submitBtn.textContent = 'Sending...';
        coachingResponse.style.display = 'none';

        try {
            const res = await fetch('/api/coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (!res.ok) {
                throw new Error('LLM request failed');
            }

            const data = await res.json();
            coachingText.textContent = data.message || 'No response from coach.';
            coachingResponse.style.display = 'block';
        } catch (err) {
            console.error(err);
            showError('Failed to get response from the coach.');
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
