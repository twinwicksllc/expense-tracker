import { 
  CognitoIdentityProviderClient, 
  AdminGetUserCommand,
  ListUsersCommand,
  AdminLinkProviderForUserCommand
} from "@aws-sdk/client-cognito-identity-provider";
import jwt from 'jsonwebtoken';

const cognitoClient = new CognitoIdentityProviderClient({ region: "us-east-1" });

const USER_POOL_ID = process.env.USER_POOL_ID;
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

/**
 * Lambda function to link a Google OAuth account to an existing Cognito user
 * 
 * This function:
 * 1. Receives an authorization code from the OAuth callback
 * 2. Exchanges it for tokens with Cognito
 * 3. Extracts the Google user ID from the ID token
 * 4. Verifies the current user's identity
 * 5. Links the Google identity to the current user's account
 */

export const handler = async (event) => {
  console.log('Link account request:', JSON.stringify(event, null, 2));

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://app.twin-wicks.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { authorizationCode, redirectUri } = body;

    // Get current user from Authorization header
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'No authorization token provided'
        })
      };
    }

    const idToken = authHeader.replace('Bearer ', '');
    
    // Decode ID token to get current user info
    // TODO: Add JWT signature verification for production
    const decoded = jwt.decode(idToken);
    
    // Check token expiry
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'TOKEN_EXPIRED',
          message: 'Authorization token has expired'
        })
      };
    }
    if (!decoded || !decoded.sub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'INVALID_TOKEN',
          message: 'Invalid authorization token'
        })
      };
    }

    const currentUserSub = decoded.sub;
    const currentUserEmail = decoded.email;
    const emailVerified = decoded.email_verified;

    // Check if email is verified
    if (!emailVerified) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'EMAIL_NOT_VERIFIED',
          message: 'Your email must be verified before linking accounts'
        })
      };
    }

    console.log(`Current user: ${currentUserSub}, email: ${currentUserEmail}, verified: ${emailVerified}`);

    // Step 1: Exchange authorization code for tokens
    const tokenEndpoint = `${COGNITO_DOMAIN}/oauth2/token`;
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: authorizationCode,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'TOKEN_EXCHANGE_FAILED',
          message: 'Failed to exchange authorization code for tokens'
        })
      };
    }

    const tokens = await tokenResponse.json();
    const googleIdToken = tokens.id_token;

    // Step 2: Decode Google ID token to get provider user ID
    // TODO: Add JWT signature verification for production
    const googleDecoded = jwt.decode(googleIdToken);
    
    // Check token expiry
    if (googleDecoded.exp && googleDecoded.exp * 1000 < Date.now()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'GOOGLE_TOKEN_EXPIRED',
          message: 'Google token has expired'
        })
      };
    }
    if (!googleDecoded || !googleDecoded.sub) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'INVALID_GOOGLE_TOKEN',
          message: 'Invalid Google ID token'
        })
      };
    }

    const googleSub = googleDecoded.sub;
    const googleEmail = googleDecoded.email;

    console.log(`Google user: ${googleSub}, email: ${googleEmail}`);

    // Step 3: Verify emails match
    if (googleEmail.toLowerCase() !== currentUserEmail.toLowerCase()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'EMAIL_MISMATCH',
          message: `Google account email (${googleEmail}) does not match your account email (${currentUserEmail})`
        })
      };
    }

    // Step 4: Check if this Google account is already linked to another user
    const listCommand = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${googleEmail}"`
    });

    const { Users } = await cognitoClient.send(listCommand);
    
    // Check if any user has this Google identity linked
    for (const user of Users) {
      const identitiesAttr = user.Attributes.find(attr => attr.Name === 'identities');
      if (identitiesAttr) {
        try {
          const identities = JSON.parse(identitiesAttr.Value);
          const googleIdentity = identities.find(id => 
            id.providerName === 'Google' && id.userId === googleSub
          );
          
          if (googleIdentity) {
            const userSub = user.Attributes.find(attr => attr.Name === 'sub')?.Value;
            if (userSub !== currentUserSub) {
              return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                  success: false,
                  error: 'ALREADY_LINKED',
                  message: 'This Google account is already linked to another user'
                })
              };
            } else {
              // Already linked to this user
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  success: true,
                  message: 'Google account is already linked to your account',
                  linkedProvider: 'Google',
                  providerEmail: googleEmail
                })
              };
            }
          }
        } catch (e) {
          console.log('Error parsing identities:', e);
        }
      }
    }

    // Step 5: Link the Google identity to the current user
    const linkCommand = new AdminLinkProviderForUserCommand({
      UserPoolId: USER_POOL_ID,
      DestinationUser: {
        ProviderName: 'Cognito',
        ProviderAttributeName: 'Cognito_Subject',
        ProviderAttributeValue: currentUserSub
      },
      SourceUser: {
        ProviderName: 'Google',
        ProviderAttributeName: 'Cognito_Subject',
        ProviderAttributeValue: googleSub
      }
    });

    await cognitoClient.send(linkCommand);

    console.log(`✅ Successfully linked Google:${googleSub} to Cognito user ${currentUserSub}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Google account linked successfully',
        linkedProvider: 'Google',
        providerEmail: googleEmail
      })
    };

  } catch (error) {
    console.error('Error linking account:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred'
      })
    };
  }
};
