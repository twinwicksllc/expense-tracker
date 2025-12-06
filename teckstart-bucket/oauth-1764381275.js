function login() {
    try {
        console.log('Login clicked');
        if (!CONFIG.COGNITO.LOGIN_URL) {
            throw new Error('Login URL not configured');
        }
        window.location.href = CONFIG.COGNITO.LOGIN_URL;
    } catch (error) {
        Logger.error('Login failed', {
            error: error.message,
            stack: error.stack,
            action: 'login'
        });
        Toast.error('Login failed. Please try again.');
    }
}

function logout() {
    try {
        localStorage.clear();
        if (!CONFIG.COGNITO.SIGN_OUT_URI) {
            throw new Error('Sign out URI not configured');
        }
        window.location.href = CONFIG.COGNITO.SIGN_OUT_URI;
    } catch (error) {
        Logger.error('Logout failed', {
            error: error.message,
            stack: error.stack,
            action: 'logout'
        });
        window.location.href = '/';
    }
}

function getToken() {
    return localStorage.getItem('id_token');
}

function checkAuth() {
    try {
        const loginView = document.getElementById('login-view');
        const appContainer = document.getElementById('app-container');
        
        if (!loginView || !appContainer) {
            Logger.error('Required DOM elements not found', {
                loginView: !!loginView,
                appContainer: !!appContainer,
                action: 'checkAuth'
            });
            return false;
        }
        
        const token = getToken();
        if (!token) {
            loginView.style.display = 'block';
            appContainer.style.display = 'none';
            return false;
        }
        
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format: expected 3 parts');
            }
            
            let payload;
            try {
                payload = JSON.parse(atob(parts[1]));
            } catch (decodeError) {
                throw new Error('Failed to decode JWT payload: ' + decodeError.message);
            }
            
            if (!payload || typeof payload !== 'object') {
                throw new Error('Invalid JWT payload: not an object');
            }
            
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                console.log('Token expired');
                localStorage.clear();
                loginView.style.display = 'block';
                appContainer.style.display = 'none';
                return false;
            }
        } catch (e) {
            Logger.error('Invalid token format', {
                error: e.message,
                stack: e.stack,
                tokenLength: token ? token.length : 0,
                action: 'checkAuth'
            });
            localStorage.clear();
            loginView.style.display = 'block';
            appContainer.style.display = 'none';
            return false;
        }
        
        loginView.style.display = 'none';
        appContainer.style.display = 'flex';
        return true;
    } catch (error) {
        Logger.error('checkAuth failed', {
            error: error.message,
            stack: error.stack,
            action: 'checkAuth'
        });
        return false;
    }
}
