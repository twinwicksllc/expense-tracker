const CONFIG = {
    API_BASE_URL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod',
    RECEIPTS_BUCKET: 'expense-tracker-receipts-prod-391907191624',
    COGNITO: {
        USER_POOL_ID: 'us-east-1_iSsgMCrkM',
        CLIENT_ID: '6jb82h9lrvh29505t1ihavfte9',
        REGION: 'us-east-1',
        DOMAIN: 'https://expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com',
        REDIRECT_URI: 'https://teckstart.com/auth-callback.html',
        SIGN_OUT_URI: 'https://teckstart.com'
    }
};

CONFIG.COGNITO.LOGIN_URL = `${CONFIG.COGNITO.DOMAIN}/oauth2/authorize?client_id=${CONFIG.COGNITO.CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(CONFIG.COGNITO.REDIRECT_URI)}`;

(function validateConfig() {
    const required = ['API_BASE_URL', 'RECEIPTS_BUCKET'];
    const cognitoRequired = ['USER_POOL_ID', 'CLIENT_ID', 'REGION', 'DOMAIN', 'REDIRECT_URI', 'SIGN_OUT_URI', 'LOGIN_URL'];
    
    for (const key of required) {
        if (!CONFIG[key]) {
            console.error(`Missing required config: ${key}`);
        }
    }
    
    for (const key of cognitoRequired) {
        if (!CONFIG.COGNITO[key]) {
            console.error(`Missing required Cognito config: ${key}`);
        }
    }
})();
