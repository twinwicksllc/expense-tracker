function login() {
    console.log('Login clicked');
    window.location.href = CONFIG.COGNITO.LOGIN_URL;
}

function logout() {
    localStorage.clear();
    window.location.href = CONFIG.COGNITO.SIGN_OUT_URI;
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