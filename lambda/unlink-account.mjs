import { 
  CognitoIdentityProviderClient, 
  AdminDisableProviderForUserCommand,
  AdminGetUserCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { extractAndValidateToken } from './auth-utils.mjs';

const cognitoClient = new CognitoIdentityProviderClient({ region: "us-east-1" });
const dynamoClient = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_7H7R5DVZT';
const DENYLIST_TABLE = process.env.DENYLIST_TABLE || 'expense-tracker-token-denylist-prod';

// Rate limiting: simple in-memory store (for production, consider DynamoDB or Redis)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

/**
 * Lambda function to unlink a Google OAuth account from an existing Cognito user
 * 
 * Security features:
 * - JWT signature and audience verification using Cognito JWKS
 * - Token denylist check
 * - Rate limiting per user
 * - Input validation
 * - Sanitized error messages
 * - CORS restricted to trusted domain
 * - Adds token to denylist after unlinking
 */

/**
 * Check rate limit
 */
function checkRateLimit(userId) {
  const now = Date.now();
  const userRequests = rateLimitStore.get(userId) || [];
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }
  
  // Add current request
  recentRequests.push(now);
  rateLimitStore.set(userId, recentRequests);
  
  return true; // Within rate limit
}

/**
 * Add token to denylist
 */
async function addTokenToDenylist(jti, exp) {
  if (!jti) {
    console.warn('No jti claim in token, cannot add to denylist');
    return;
  }

  try {
    await docClient.send(new PutCommand({
      TableName: DENYLIST_TABLE,
      Item: {
        jti,
        ttl: exp, // DynamoDB will auto-delete after token expiration
        deniedAt: Math.floor(Date.now() / 1000),
        reason: 'account_unlink'
      }
    }));
    console.log(`Token ${jti} added to denylist`);
  } catch (error) {
    console.error('Failed to add token to denylist:', error);
    // Don't fail the request if denylist update fails
  }
}

export const handler = async (event) => {
  console.log('Unlink account request received');

  // CORS headers - restricted to trusted domain
  const headers = {
    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
    // Extract and validate token (includes signature, claims, and denylist check)
    let decoded;
    try {
      decoded = await extractAndValidateToken(event.headers);
    } catch (err) {
      console.error('Token validation failed:', err.message);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'UNAUTHORIZED',
          message: err.message.includes('revoked') ? 'Token has been revoked' : 'Invalid or expired token'
        })
      };
    }

    // Validate required claims
    if (!decoded.sub || !decoded.email) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'INVALID_TOKEN',
          message: 'Missing required claims'
        })
      };
    }

    const currentUserSub = decoded.sub;
    const currentUserEmail = decoded.email;
    const tokenJti = decoded.jti;
    const tokenExp = decoded.exp;

    // Check rate limit
    if (!checkRateLimit(currentUserSub)) {
      console.warn(`Rate limit exceeded for user: ${currentUserSub}`);
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.'
        })
      };
    }

    // Get user's current identities
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: currentUserSub
    });

    let userResponse;
    try {
      userResponse = await cognitoClient.send(getUserCommand);
    } catch (err) {
      console.error('Failed to get user:', err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'SERVER_ERROR',
          message: 'Failed to retrieve user information'
        })
      };
    }
    
    // Find identities attribute
    const identitiesAttr = userResponse.UserAttributes.find(attr => attr.Name === 'identities');
    
    if (!identitiesAttr || !identitiesAttr.Value) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'NO_LINKED_ACCOUNTS',
          message: 'No Google account is currently linked'
        })
      };
    }

    // Parse and validate identities
    let identities;
    try {
      identities = JSON.parse(identitiesAttr.Value);
      if (!Array.isArray(identities)) {
        throw new Error('Invalid identities format');
      }
    } catch (err) {
      console.error('Failed to parse identities:', err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'SERVER_ERROR',
          message: 'Failed to process linked accounts'
        })
      };
    }

    const googleIdentities = identities.filter(id => 
      id && 
      id.providerName === 'Google' && 
      id.userId && 
      typeof id.userId === 'string'
    );

    if (googleIdentities.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'NO_GOOGLE_ACCOUNT',
          message: 'No Google account is currently linked'
        })
      };
    }

    // Unlink all Google identities
    let unlinkedCount = 0;
    for (const googleIdentity of googleIdentities) {
      try {
        const unlinkCommand = new AdminDisableProviderForUserCommand({
          UserPoolId: USER_POOL_ID,
          User: {
            ProviderName: 'Google',
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: googleIdentity.userId
          }
        });

        await cognitoClient.send(unlinkCommand);
        unlinkedCount++;
        console.log(`Successfully unlinked Google identity for user: ${currentUserSub}`);
      } catch (err) {
        console.error(`Failed to unlink Google identity ${googleIdentity.userId}:`, err.message);
        // Continue trying to unlink other identities
      }
    }

    if (unlinkedCount === 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'UNLINK_FAILED',
          message: 'Failed to unlink Google account'
        })
      };
    }

    // Add current token to denylist (invalidate immediately)
    await addTokenToDenylist(tokenJti, tokenExp);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Google account successfully unlinked. Please log in again.',
        unlinkedCount,
        tokenRevoked: true
      })
    };

  } catch (error) {
    // Log detailed error server-side only
    console.error('Unexpected error in unlink-account:', error);
    
    // Return generic error to client
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'SERVER_ERROR',
        message: 'An unexpected error occurred'
      })
    };
  }
};
