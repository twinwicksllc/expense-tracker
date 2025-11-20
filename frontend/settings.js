// Settings page JavaScript for account linking

const API_GATEWAY_URL = 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod';
const COGNITO_DOMAIN = 'https://expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com';
const CLIENT_ID = '6jb82h9lrvh29505t1ihavfte9';
const REDIRECT_URI = 'https://teckstart.com/settings.html';

// Check if user is logged in
document.addEventListener('DOMContentLoaded', async () => {
    const idToken = localStorage.getItem('idToken');
    
    if (!idToken || isJwtExpired(idToken)) {
        // Not logged in or token expired, redirect to login
        localStorage.clear();
        window.location.href = 'index.html';
        return;
    }

    // Display user email and ID
    try {
        const payload = parseJwt(idToken);
        document.getElementById('user-email').textContent = payload.email || 'N/A';
        const userIdElement = document.getElementById('user-id');
        if (userIdElement) {
            userIdElement.textContent = payload.sub || 'N/A';
        }
        
        // Check if Google account is already linked
        await checkGoogleLinkStatus(payload);
    } catch (error) {
        console.error('Error loading user info:', error);
    }

    // Setup tab switching
    setupTabs();
    
    // Load AWS credentials status (for AWS tab)
    loadAWSCredentialsStatus();

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
        sessionStorage.removeItem('oauthFlow');
        
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
            const identities = payload.identities;
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
        linkBtn.onclick = unlinkGoogleAccount;
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
    
    // Mark this as a LINK_ACCOUNT flow (not a login flow)
    // This helps differentiate between OAuth for login vs OAuth for account linking
    sessionStorage.setItem('oauthFlow', 'LINK_ACCOUNT');
    
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

// Unlink Google account
async function unlinkGoogleAccount() {
    if (!confirm('Are you sure you want to unlink your Google account? You will still be able to sign in with email and password.')) {
        return;
    }

    showMessage('Unlinking Google account...', 'info');

    try {
        const idToken = localStorage.getItem('idToken');
        
        if (!idToken) {
            showMessage('❌ Please log in again to unlink your account', 'error');
            return;
        }

        // Call backend API to unlink account
        const response = await fetch(`${API_GATEWAY_URL}/unlink-account`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            }
        });

        // Validate response
        if (!response) {
            throw new Error('No response from server');
        }

        let result;
        try {
            result = await response.json();
        } catch (e) {
            throw new Error('Invalid response from server');
        }

        // Validate response structure
        if (typeof result !== 'object' || result === null) {
            throw new Error('Invalid response format');
        }

        // Handle specific error cases
        if (response.status === 401) {
            showMessage('❌ Your session has expired. Please log in again.', 'error');
            setTimeout(() => {
                localStorage.clear();
                window.location.href = 'index.html';
            }, 2000);
            return;
        }

        if (response.status === 429) {
            showMessage('❌ Too many requests. Please wait a moment and try again.', 'error');
            return;
        }

        if (response.ok && result.success === true) {
            showMessage('✅ Google account unlinked successfully! Redirecting to login...', 'success');
            updateLinkStatus(false);
            
            // Token has been revoked, force re-login
            setTimeout(() => {
                localStorage.clear();
                window.location.href = 'index.html';
            }, 2000);
        } else {
            const errorMsg = typeof result.message === 'string' ? result.message : 'Failed to unlink account';
            showMessage(`❌ ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('Error unlinking account:', error);
        
        // User-friendly error messages
        let userMessage = 'Failed to unlink account. Please try again.';
        
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            userMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('session') || error.message.includes('authenticated')) {
            userMessage = 'Your session has expired. Please log in again.';
        }
        
        showMessage(`❌ ${userMessage}`, 'error');
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


// Tab switching functionality
function setupTabs() {
    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    const tabContents = document.querySelectorAll('.settings-tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Remove active class from all tabs and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            button.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
        });
    });
}

// AWS Credentials Management (migrated from app.js)
async function loadAWSCredentialsStatus() {
    const statusDiv = document.getElementById('aws-credentials-status');
    if (!statusDiv) return; // AWS tab not loaded yet
    
    const idToken = localStorage.getItem('idToken');
    
    try {
        const response = await fetch(`${API_GATEWAY_URL}/aws-credentials`, {
            headers: {
                'Authorization': idToken
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.hasCredentials) {
                statusDiv.innerHTML = `
                    <div class="credential-status-card connected">
                        <div class="status-header">
                            <span class="status-icon">✓</span>
                            <span class="status-text">AWS Account Connected</span>
                        </div>
                        <div class="credential-details">
                            <p><strong>Access Key:</strong> ${data.accessKeyId || 'Not available'}</p>
                            <p><strong>Region:</strong> ${data.region || 'us-east-1'}</p>
                            ${data.iamArn ? `<p><strong>IAM ARN:</strong> <code>${data.iamArn}</code></p>` : ''}
                        </div>
                        <div class="credential-actions">
                            <div class="form-group" style="margin-bottom: 1rem;">
                                <label for="import-months">Import last:</label>
                                <select id="import-months" style="margin-left: 0.5rem; padding: 0.5rem;">
                                    <option value="1">1 month</option>
                                    <option value="2">2 months</option>
                                    <option value="3">3 months</option>
                                    <option value="6">6 months</option>
                                    <option value="12">12 months</option>
                                </select>
                            </div>
                            <button type="button" id="trigger-aws-import" class="btn btn-primary">Import Now</button>
                            <button type="button" id="update-aws-credentials" class="btn btn-secondary">Update Credentials</button>
                            <button type="button" id="delete-aws-credentials" class="btn btn-danger">Delete Credentials</button>
                        </div>
                    </div>
                `;
                
                document.getElementById('trigger-aws-import').addEventListener('click', triggerAWSImport);
                document.getElementById('update-aws-credentials').addEventListener('click', showAWSCredentialsForm);
                document.getElementById('delete-aws-credentials').addEventListener('click', deleteAWSCredentials);
            } else {
                showNoAWSCredentialsStatus();
            }
        } else {
            showNoAWSCredentialsStatus();
        }
    } catch (error) {
        console.error('Error loading AWS credentials status:', error);
        showNoAWSCredentialsStatus();
    }
}

function showNoAWSCredentialsStatus() {
    const statusDiv = document.getElementById('aws-credentials-status');
    if (!statusDiv) return;
    
    statusDiv.innerHTML = `
        <div class="credential-status-card not-connected">
            <div class="status-header">
                <span class="status-icon">○</span>
                <span class="status-text">No AWS Account Connected</span>
            </div>
            <p class="status-description">Connect your AWS account to import monthly cost data automatically.</p>
            <button type="button" id="add-aws-credentials" class="btn btn-primary">Add AWS Credentials</button>
        </div>
    `;
    
    document.getElementById('add-aws-credentials').addEventListener('click', showAWSCredentialsForm);
}

function showAWSCredentialsForm() {
    const form = document.getElementById('aws-credentials-form');
    if (form) {
        form.style.display = 'block';
        
        // Setup form event listeners
        document.getElementById('save-aws-credentials').addEventListener('click', saveAWSCredentials);
        document.getElementById('cancel-aws-credentials').addEventListener('click', () => {
            form.style.display = 'none';
            clearAWSCredentialsForm();
        });
        
        const copyArnBtn = document.getElementById('copy-arn');
        if (copyArnBtn) {
            copyArnBtn.addEventListener('click', () => {
                const arnValue = document.getElementById('iam-arn-value').textContent;
                navigator.clipboard.writeText(arnValue);
                showAWSMessage('ARN copied to clipboard!', 'success');
            });
        }
    }
}

async function saveAWSCredentials() {
    const accessKey = document.getElementById('aws-access-key').value.trim();
    const secretKey = document.getElementById('aws-secret-key').value.trim();
    const region = document.getElementById('aws-region').value;
    
    if (!accessKey || !secretKey) {
        showAWSMessage('Please enter both Access Key ID and Secret Access Key', 'error');
        return;
    }
    
    const idToken = localStorage.getItem('idToken');
    
    try {
        const response = await fetch(`${API_GATEWAY_URL}/aws-credentials`, {
            method: 'POST',
            headers: {
                'Authorization': idToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
                region: region
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAWSMessage('AWS credentials saved successfully!', 'success');
            
            // Display IAM ARN if available
            if (data.iamArn) {
                const arnDisplay = document.getElementById('iam-arn-display');
                const arnValue = document.getElementById('iam-arn-value');
                if (arnDisplay && arnValue) {
                    arnValue.textContent = data.iamArn;
                    arnDisplay.style.display = 'block';
                }
            }
            
            // Reload status after a delay
            setTimeout(() => {
                document.getElementById('aws-credentials-form').style.display = 'none';
                clearAWSCredentialsForm();
                loadAWSCredentialsStatus();
            }, 2000);
        } else {
            showAWSMessage(data.error || 'Failed to save credentials', 'error');
        }
    } catch (error) {
        console.error('Error saving AWS credentials:', error);
        showAWSMessage('Error saving credentials. Please try again.', 'error');
    }
}

async function triggerAWSImport() {
    const button = document.getElementById('trigger-aws-import');
    const originalText = button.textContent;
    
    button.disabled = true;
    button.textContent = 'Importing...';
    
    const idToken = localStorage.getItem('idToken');
    const months = parseInt(document.getElementById('import-months').value) || 1;
    
    try {
        const response = await fetch(`${API_GATEWAY_URL}/aws-cost-import`, {
            method: 'POST',
            headers: {
                'Authorization': idToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ months })
        });
        
        if (response.ok) {
            const data = await response.json();
            // The Lambda returns a summary with results array
            if (data.results && data.results.length > 0) {
                const result = data.results[0]; // Get first result (current user)
                if (result.status === 'success') {
                    const message = `Import successful! ${result.expensesCreated} expenses imported (${result.duplicatesSkipped} duplicates skipped, ${result.belowMinimumSkipped} zero-cost items skipped). Total: $${result.totalAmount}`;
                    showAWSMessage(message, 'success');
                } else if (result.status === 'skipped') {
                    showAWSMessage(`Import skipped: ${result.reason}`, 'error');
                } else {
                    showAWSMessage(`Import failed: ${result.error}`, 'error');
                }
            } else {
                showAWSMessage('Import completed but no results returned', 'error');
            }
        } else {
            const data = await response.json();
            showAWSMessage(data.error || 'Failed to import AWS costs', 'error');
        }
    } catch (error) {
        console.error('Error triggering AWS import:', error);
        showAWSMessage('Error triggering import. Please try again.', 'error');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function deleteAWSCredentials() {
    if (!confirm('Are you sure you want to delete your AWS credentials? This will stop automatic cost imports.')) {
        return;
    }
    
    const idToken = localStorage.getItem('idToken');
    
    try {
        const response = await fetch(`${API_GATEWAY_URL}/aws-credentials`, {
            method: 'DELETE',
            headers: {
                'Authorization': idToken
            }
        });
        
        if (response.ok) {
            showAWSMessage('AWS credentials deleted successfully', 'success');
            setTimeout(() => {
                loadAWSCredentialsStatus();
            }, 1500);
        } else {
            const data = await response.json();
            showAWSMessage(data.error || 'Failed to delete credentials', 'error');
        }
    } catch (error) {
        console.error('Error deleting AWS credentials:', error);
        showAWSMessage('Error deleting credentials. Please try again.', 'error');
    }
}

function clearAWSCredentialsForm() {
    document.getElementById('aws-access-key').value = '';
    document.getElementById('aws-secret-key').value = '';
    document.getElementById('aws-region').value = 'us-east-1';
    document.getElementById('iam-arn-display').style.display = 'none';
    showAWSMessage('', '');
}

function showAWSMessage(message, type) {
    const errorDiv = document.getElementById('aws-credentials-error');
    const successDiv = document.getElementById('aws-credentials-success');
    
    // Clear both messages and remove show class
    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.classList.remove('show');
    }
    if (successDiv) {
        successDiv.textContent = '';
        successDiv.classList.remove('show');
    }
    
    // Show the appropriate message
    if (type === 'error' && errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    } else if (type === 'success' && successDiv) {
        successDiv.textContent = message;
        successDiv.classList.add('show');
    }
}
