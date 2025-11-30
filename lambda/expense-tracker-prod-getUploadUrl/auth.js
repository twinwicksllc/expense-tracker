const {
    CognitoIdentityProviderClient,
    SignUpCommand,
    ConfirmSignUpCommand,
    InitiateAuthCommand,
    GetUserCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const cognito = new CognitoIdentityProviderClient({});

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

/**
 * Safely parse request body
 */
function parseBody(event) {
    if (!event.body) return {};
    
    if (typeof event.body === 'string') {
        let bodyString = event.body;
        
        // Check if body is base64 encoded
        if (event.isBase64Encoded) {
            bodyString = Buffer.from(event.body, 'base64').toString('utf-8');
        }
        
        try {
            return JSON.parse(bodyString);
        } catch (e) {
            console.error('Failed to parse body:', bodyString);
            throw new Error('Invalid JSON');
        }
    }
    
    return event.body;
}

/**
 * Sign up a new user
 */
exports.signup = async (event) => {
    try {
        const { email, password } = parseBody(event);

        if (!email || !password) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Email and password are required' })
            };
        }

        const command = new SignUpCommand({
            ClientId: CLIENT_ID,
            Username: email,
            Password: password,
            UserAttributes: [
                {
                    Name: 'email',
                    Value: email
                }
            ]
        });

        const response = await cognito.send(command);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: 'User created successfully',
                userSub: response.UserSub
            })
        };
    } catch (error) {
        console.error('Signup error:', error);
        
        return {
            statusCode: error.statusCode || 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: error.message || 'Failed to create user'
            })
        };
    }
};

/**
 * Confirm user signup with verification code
 */
exports.confirmSignup = async (event) => {
    try {
        const { email, code } = parseBody(event);

        if (!email || !code) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Email and confirmation code are required' })
            };
        }

        const command = new ConfirmSignUpCommand({
            ClientId: CLIENT_ID,
            Username: email,
            ConfirmationCode: code
        });

        await cognito.send(command);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: 'Email confirmed successfully'
            })
        };
    } catch (error) {
        console.error('Confirm signup error:', error);
        
        return {
            statusCode: error.statusCode || 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: error.message || 'Failed to confirm signup'
            })
        };
    }
};

/**
 * Login user
 */
exports.login = async (event) => {
    try {
        const { email, password } = parseBody(event);

        if (!email || !password) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Email and password are required' })
            };
        }

        const command = new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: CLIENT_ID,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password
            }
        });

        const response = await cognito.send(command);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                idToken: response.AuthenticationResult.IdToken,
                accessToken: response.AuthenticationResult.AccessToken,
                refreshToken: response.AuthenticationResult.RefreshToken,
                expiresIn: response.AuthenticationResult.ExpiresIn
            })
        };
    } catch (error) {
        console.error('Login error:', error);
        
        return {
            statusCode: error.statusCode || 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: error.message || 'Invalid credentials'
            })
        };
    }
};

/**
 * Get current user info
 */
exports.getUser = async (event) => {
    try {
        const accessToken = event.headers.Authorization?.replace('Bearer ', '');

        if (!accessToken) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'No token provided' })
            };
        }

        const command = new GetUserCommand({
            AccessToken: accessToken
        });

        const response = await cognito.send(command);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                username: response.Username,
                attributes: response.UserAttributes
            })
        };
    } catch (error) {
        console.error('Get user error:', error);
        
        return {
            statusCode: error.statusCode || 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: error.message || 'Invalid token'
            })
        };
    }
};

