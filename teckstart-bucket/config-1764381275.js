const CONFIG = {
    API_BASE_URL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod',
    RECEIPTS_BUCKET: 'expense-tracker-receipts-prod-391907191624',
    COGNITO: {
        USER_POOL_ID: 'us-east-1_iSsgMCrkM',
        CLIENT_ID: '6jb82h9lrvh29505t1ihavfte9',
        REGION: 'us-east-1',
        DOMAIN: 'https://expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com',
        REDIRECT_URI: (() => {
            try { return new URL('https://teckstart.com/auth-callback.html').href; } catch (e) { console.error('Invalid REDIRECT_URI:', e.message); return ''; }
        })(),
        SIGN_OUT_URI: (() => {
            try { return new URL('https://teckstart.com').href; } catch (e) { console.error('Invalid SIGN_OUT_URI:', e.message); return ''; }
        })()
    }
};

if (CONFIG.COGNITO && CONFIG.COGNITO.DOMAIN && CONFIG.COGNITO.CLIENT_ID && CONFIG.COGNITO.REDIRECT_URI) {
    CONFIG.COGNITO.LOGIN_URL = `${CONFIG.COGNITO.DOMAIN}/oauth2/authorize?client_id=${CONFIG.COGNITO.CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(CONFIG.COGNITO.REDIRECT_URI)}`;
}

(function validateConfig() {
    const required = ['API_BASE_URL', 'RECEIPTS_BUCKET'];
    const cognitoRequired = ['USER_POOL_ID', 'CLIENT_ID', 'REGION', 'DOMAIN', 'REDIRECT_URI', 'SIGN_OUT_URI', 'LOGIN_URL'];
    
    if (typeof CONFIG !== 'undefined' && CONFIG) {
        for (const key of required) {
            if (!CONFIG[key]) {
                console.error(`Missing required config: ${key}`);
            }
        }
    } else {
        console.error('CONFIG object is not defined');
        return;
    }
    
    if (CONFIG.COGNITO) {
        for (const key of cognitoRequired) {
            if (!CONFIG.COGNITO[key]) {
                console.error(`Missing required Cognito config: ${key}`);
            }
        }
    } else {
        console.error('Missing COGNITO configuration object');
    }
})();
