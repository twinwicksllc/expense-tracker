import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_7H7R5DVZT';
const CLIENT_ID = process.env.CLIENT_ID || 'pk3l1fkkre0ms4si0prabfavl';
const REGION = process.env.AWS_REGION || 'us-east-1';
const COGNITO_ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
const DENYLIST_TABLE = process.env.DENYLIST_TABLE || 'expense-tracker-token-denylist-prod';

// JWKS client for JWT verification
const jwksClientInstance = jwksClient({
  jwksUri: `${COGNITO_ISSUER}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
  rateLimit: true
});

/**
 * Get signing key for JWT verification
 */
function getKey(header, callback) {
  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Verify JWT token signature and claims
 * @param {string} token - JWT token to verify
 * @returns {Promise<object>} Decoded token payload
 * @throws {Error} If token is invalid
 */
export async function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        issuer: COGNITO_ISSUER,
        audience: CLIENT_ID, // Validate audience claim
        algorithms: ['RS256']
      },
      (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      }
    );
  });
}

/**
 * Check if token is in denylist
 * @param {string} jti - JWT ID (jti claim)
 * @returns {Promise<boolean>} True if token is denied
 */
export async function isTokenDenied(jti) {
  if (!jti) {
    return false; // If no jti, can't check denylist
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: DENYLIST_TABLE,
      Key: { jti }
    }));

    return !!result.Item; // True if item exists in denylist
  } catch (error) {
    console.error('Error checking token denylist:', error);
    // On error, fail open (allow request) to prevent service disruption
    // In production, you might want to fail closed for higher security
    return false;
  }
}

/**
 * Validate token and check denylist
 * @param {string} token - JWT token to validate
 * @returns {Promise<object>} Decoded token payload
 * @throws {Error} If token is invalid or denied
 */
export async function validateToken(token) {
  // Verify signature and claims
  const decoded = await verifyToken(token);

  // Check if token is in denylist
  const denied = await isTokenDenied(decoded.jti);
  if (denied) {
    throw new Error('Token has been revoked');
  }

  return decoded;
}

/**
 * Extract and validate token from Authorization header
 * @param {object} headers - HTTP headers object
 * @returns {Promise<object>} Decoded token payload
 * @throws {Error} If token is missing, invalid, or denied
 */
export async function extractAndValidateToken(headers) {
  const authHeader = headers.Authorization || headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.replace('Bearer ', '').trim();
  
  if (!token || token.split('.').length !== 3) {
    throw new Error('Invalid token format');
  }

  return await validateToken(token);
}
