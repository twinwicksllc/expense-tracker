function login() {
    console.log('Login clicked');
    window.location.href = CONFIG.COGNITO.LOGIN_URL;
}

function logout() {
    localStorage.clear();
    const logoutUrl = `${CONFIG.COGNITO.DOMAIN}/logout?client_id=${CONFIG.COGNITO.CLIENT_ID}&logout_uri=${encodeURIComponent(CONFIG.COGNITO.SIGN_OUT_URI)}`;
    window.location.href = logoutUrl;
}

function getToken() {
    return localStorage.getItem('id_token');
}

function checkAuth() {
    const token = getToken();
    if (!token) {
        document.getElementById('login-view').style.display = 'block';
        document.getElementById('app-container').style.display = 'none';
        return false;
    }
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    return true;
}