const CONFIG = {
    API_BASE_URL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod',
    COGNITO: {
        USER_POOL_ID: 'us-east-1_iSsgMCrkM',
        CLIENT_ID: '6jb82h9lrvh29505t1ihavfte9',
        REGION: 'us-east-1',
        DOMAIN: 'https://expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com',
        REDIRECT_URI: 'https://teckstart.com/callback.html',
        SIGN_OUT_URI: 'https://teckstart.com',
        LOGIN_URL: `https://expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com/login?client_id=6jb82h9lrvh29505t1ihavfte9&response_type=token&scope=email+openid+profile&redirect_uri=https://teckstart.com/callback.html`
    }
};