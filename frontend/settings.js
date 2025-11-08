// Settings page JavaScript for account linking

const API_GATEWAY_URL = 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod';
const COGNITO_DOMAIN = 'https://expense-tracker-prod.auth.us-east-1.amazoncognito.com';
const CLIENT_ID = '7pj7nfvvd0kcqj2ck9aqjjqo6m';
const REDIRECT_URI = 'https://app.twin-wicks.com/settings.html';

// Check if user is logged in
document.addEventListener('DOMContentLoaded', async () => {
    const idToken = localStorage.getItem('idToken');
    
    if (!idToken || isJwtExpired(idToken)) {
        // Not logged in or token expired, redirect to login
        localStorage.clear();
        window.location.href = 'index.html';
        return;
    }

    // Display user email
    try {
        const payload = parseJwt(idToken);
        document.getElementById('user-email').textContent = payload.email || 'N/A';
        
        // Check if Google account is already linked
        await checkGoogleLinkStatus(payload);
    } catch (error) {
        console.error('Error loading user info:', error);
    }

    // Check if we're returning from OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
        showMessage(`OAuth error: ${error}`, 'error');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authCode) {
        // Validate authorization code format
        if (!/^[\w-]{20,}$/.test(authCode)) {
            showMessage('Invalid authorization code format', 'error');
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        
        // Validate OAuth state parameter
        const state = urlParams.get('state');
        const savedState = sessionStorage.getItem('oauthState');
        
        if (!state || state !== savedState) {
            showMessage('Invalid OAuth state. Possible CSRF attack detected.', 'error');
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        
        // Clear state after validation
        sessionStorage.removeItem('oauthState');
        
        // Handle OAuth callback
        await handleLinkCallback(authCode);
    }
});

// Parse JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Error parsing JWT:', error);
        return {};
    }
}

// Check if JWT is expired
function isJwtExpired(token) {
    const payload = parseJwt(token);
    if (!payload.exp) return true;
    return Date.now() >= payload.exp * 1000;
}

// Check if Google account is already linked
async function checkGoogleLinkStatus(payload) {
    // Check if identities claim exists (indicates federated login)
    if (payload.identities) {
        try {
            const identities = JSON.parse(payload.identities);
            const googleIdentity = identities.find(id => id.providerName === 'Google');
            
            if (googleIdentity) {
                updateLinkStatus(true, payload.email);
                return;
            }
        } catch (error) {
            console.error('Error parsing identities:', error);
        }
    }
    
    updateLinkStatus(false);
}

// Update UI to show link status
function updateLinkStatus(isLinked, email = null) {
    const statusIcon = document.getElementById('google-status-icon');
    const statusTitle = document.getElementById('google-status-title');
    const statusSubtitle = document.getElementById('google-status-subtitle');
    const linkBtn = document.getElementById('link-google-btn');

    if (isLinked) {
        statusIcon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
        statusIcon.style.color = '#10b981';
        statusTitle.textContent = 'Google Account: Linked';
        statusSubtitle.textContent = email || 'Successfully linked';
        linkBtn.textContent = 'Unlink';
        linkBtn.onclick = () => showMessage('Unlinking not yet implemented', 'info');
        linkBtn.classList.add('btn-secondary');
        linkBtn.classList.remove('btn-google');
    } else {
        statusIcon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
        statusIcon.style.color = '#6b7280';
        statusTitle.textContent = 'Google Account';
        statusSubtitle.textContent = 'Not linked';
    }
}

// Initiate Google account linking
function linkGoogleAccount() {
    // Generate random state for CSRF protection
    const state = Array.from(crypto.getRandomValues(new Uint32Array(4)))
        .map(n => n.toString(36))
        .join('');
    
    // Store state in sessionStorage for validation
    sessionStorage.setItem('oauthState', state);
    
    // Build OAuth authorization URL
    const authUrl = `${COGNITO_DOMAIN}/oauth2/authorize?` + new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        scope: 'email openid profile',
        redirect_uri: REDIRECT_URI,
        identity_provider: 'Google',
        state: state
    });

    // Redirect to Cognito Hosted UI
    window.location.href = authUrl;
}

// Handle OAuth callback after Google sign-in
async function handleLinkCallback(authCode) {
    showMessage('Linking Google account...', 'info');

    try {
        const idToken = localStorage.getItem('idToken');
        
        if (!idToken) {
            throw new Error('Not authenticated');
        }

        // Call backend API to link accounts
        const response = await fetch(`${API_GATEWAY_URL}/link-account`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                authorizationCode: authCode,
                redirectUri: REDIRECT_URI
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showMessage('✅ Google account linked successfully! You can now sign in with either email/password or Google.', 'success');
            updateLinkStatus(true, result.providerEmail);
            
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            throw new Error(result.message || 'Failed to link account');
        }
    } catch (error) {
        console.error('Error linking account:', error);
        showMessage(`❌ Failed to link account: ${error.message}`, 'error');
        
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Show message to user
function showMessage(message, type = 'info') {
    const messageEl = document.getElementById('link-message');
    messageEl.textContent = message;
    messageEl.className = `message message-${type}`;
    messageEl.style.display = 'block';

    // Auto-hide after 10 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 10000);
    }
}

// Sign out
function signOut() {
    localStorage.clear();
    window.location.href = 'index.html';
}
