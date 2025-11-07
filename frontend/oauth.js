// OAuth Authentication Module
// Handles Google OAuth flow via AWS Cognito Hosted UI

/**
 * Initiates Google OAuth sign-in flow
 * Redirects user to Cognito Hosted UI with Google as identity provider
 */
function signInWithGoogle() {
    const params = new URLSearchParams({
        identity_provider: 'Google',
        redirect_uri: CONFIG.COGNITO.REDIRECT_URI,
        response_type: 'code',
        client_id: CONFIG.COGNITO.CLIENT_ID,
        scope: 'openid email profile aws.cognito.signin.user.admin'
    });

    const authUrl = `${CONFIG.COGNITO.DOMAIN}/oauth2/authorize?${params.toString()}`;
    window.location.href = authUrl;
}

/**
 * Handles OAuth callback after successful authentication
 * Exchanges authorization code for tokens
 */
async function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    // Handle error from OAuth provider
    if (error) {
        console.error('OAuth error:', error, errorDescription);
        showError('auth-error', errorDescription || 'Authentication failed');
        // Redirect back to login page after a delay
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);
        return;
    }

    // No code means this isn't a callback
    if (!code) {
        return false;
    }

    try {
        showLoading();

        // Exchange authorization code for tokens
        const tokenResponse = await fetch(`${CONFIG.COGNITO.DOMAIN}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: CONFIG.COGNITO.CLIENT_ID,
                code: code,
                redirect_uri: CONFIG.COGNITO.REDIRECT_URI
            })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            throw new Error(errorData.error_description || 'Failed to exchange authorization code');
        }

        const tokens = await tokenResponse.json();
        
        // Parse ID token to get user info
        const idTokenPayload = parseJwt(tokens.id_token);
        
        // Store authentication data
        state.user = {
            email: idTokenPayload.email,
            name: idTokenPayload.name,
            sub: idTokenPayload.sub,
            authProvider: 'Google'
        };
        state.idToken = tokens.id_token;
        
        // Store tokens in localStorage
        localStorage.setItem('idToken', tokens.id_token);
        localStorage.setItem('accessToken', tokens.access_token);
        localStorage.setItem('refreshToken', tokens.refresh_token);
        localStorage.setItem('userEmail', idTokenPayload.email);
        localStorage.setItem('userName', idTokenPayload.name || '');
        localStorage.setItem('authProvider', 'Google');

        // Clear URL parameters
        window.history.replaceState({}, document.title, '/');

        // Show main screen
        hideLoading();
        showMainScreen();
        
        return true;
    } catch (error) {
        console.error('OAuth callback error:', error);
        hideLoading();
        showError('auth-error', error.message || 'Authentication failed');
        
        // Redirect back to login page after a delay
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);
        
        return false;
    }
}

/**
 * Refreshes access token using refresh token
 */
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    try {
        const response = await fetch(`${CONFIG.COGNITO.DOMAIN}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: CONFIG.COGNITO.CLIENT_ID,
                refresh_token: refreshToken
            })
        });

        if (!response.ok) {
            throw new Error('Failed to refresh token');
        }

        const tokens = await response.json();
        
        // Update stored tokens
        state.idToken = tokens.id_token;
        localStorage.setItem('idToken', tokens.id_token);
        localStorage.setItem('accessToken', tokens.access_token);

        return tokens;
    } catch (error) {
        console.error('Token refresh error:', error);
        // If refresh fails, logout user
        logout();
        throw error;
    }
}

/**
 * Signs out user from Cognito (works for both email/password and OAuth)
 */
function signOut() {
    // Check auth provider BEFORE clearing localStorage
    const authProvider = localStorage.getItem('authProvider');
    
    // Clear local state
    state.user = null;
    state.idToken = null;
    
    // If user signed in with Google, use Cognito hosted UI logout
    if (authProvider === 'Google') {
        // Clear storage before redirect
        localStorage.clear();
        
        const params = new URLSearchParams({
            client_id: CONFIG.COGNITO.CLIENT_ID,
            logout_uri: CONFIG.COGNITO.SIGN_OUT_URI
        });
        
        const logoutUrl = `${CONFIG.COGNITO.DOMAIN}/logout?${params.toString()}`;
        window.location.href = logoutUrl;
    } else {
        // For email/password, clear storage and show auth screen
        localStorage.clear();
        showAuthScreen();
    }
}

/**
 * Parses JWT token to extract payload
 */
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Error parsing JWT:', error);
        return null;
    }
}

/**
 * Checks if user is authenticated (works for both auth methods)
 */
function checkOAuthAuth() {
    const token = localStorage.getItem('idToken');
    const email = localStorage.getItem('userEmail');
    const authProvider = localStorage.getItem('authProvider');
    
    if (token && email) {
        state.idToken = token;
        state.user = {
            email,
            name: localStorage.getItem('userName') || '',
            authProvider: authProvider || 'Cognito'
        };
        return true;
    }
    return false;
}

/**
 * Updates the logout function to handle both auth methods
 */
function logoutWithOAuth() {
    signOut();
}

