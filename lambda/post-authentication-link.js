/**
 * Post-Authentication Lambda Trigger for Account Linking
 * 
 * Links email/password and Google OAuth accounts when users sign in
 * with the same verified email address.
 * 
 * Trigger: Post-Authentication (after successful authentication)
 * Security: Requires email_verified = true for both accounts
 * 
 * Version: 1.6.0
 * Date: November 7, 2025
 */

const { CognitoIdentityProviderClient, ListUsersCommand, AdminLinkProviderForUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Validate environment variables
if (!process.env.USER_POOL_ID) {
    throw new Error('USER_POOL_ID environment variable is required');
}

const client = new CognitoIdentityProviderClient({ region: process.env.REGION || 'us-east-1' });
const USER_POOL_ID = process.env.USER_POOL_ID;

/**
 * Main Lambda handler
 * @param {Object} event - Cognito Post-Authentication trigger event
 * @param {Object} context - Lambda context
 * @returns {Object} - Original event (required by Cognito)
 */
exports.handler = async (event, context) => {
    console.log('Post-Authentication trigger event:', JSON.stringify(event, null, 2));
    
    try {
        // Extract user attributes from event
        const email = event.request.userAttributes.email;
        const emailVerified = event.request.userAttributes.email_verified;
        const currentUsername = event.userName;
        
        // Log authentication details
        console.log('Authentication details:', {
            email,
            emailVerified,
            username: currentUsername,
            userPoolId: USER_POOL_ID
        });
        
        // Security check: Only proceed if email is verified
        if (emailVerified !== 'true') {
            console.log('Email not verified, skipping account linking', {
                email,
                emailVerified
            });
            return event;
        }
        
        // Determine if this is a federated user (Google OAuth)
        // Federated usernames have format: Google_<user_id>
        const isFederatedUser = currentUsername.includes('_');
        
        console.log('User type:', {
            username: currentUsername,
            isFederated: isFederatedUser
        });
        
        // Search for other users with same email
        const existingUser = await findUserByEmail(email, currentUsername);
        
        if (!existingUser) {
            console.log('No other account found with this email, no linking needed');
            return event;
        }
        
        console.log('Found existing account:', {
            username: existingUser.Username,
            email: existingUser.Attributes.find(attr => attr.Name === 'email')?.Value
        });
        
        // Check if the other account also has verified email
        const otherEmailVerified = existingUser.Attributes.find(
            attr => attr.Name === 'email_verified'
        )?.Value;
        
        if (otherEmailVerified !== 'true') {
            console.log('Other account email not verified, skipping linking', {
                otherUsername: existingUser.Username,
                otherEmailVerified
            });
            return event;
        }
        
        // Determine if the other account is federated
        const otherIsFederated = existingUser.Username.includes('_');
        
        // Only link if one is federated and one is native (email/password)
        if (isFederatedUser === otherIsFederated) {
            console.log('Both accounts are same type, no linking needed', {
                currentType: isFederatedUser ? 'federated' : 'native',
                otherType: otherIsFederated ? 'federated' : 'native'
            });
            return event;
        }
        
        // Determine which account is native and which is federated
        const nativeUsername = isFederatedUser ? existingUser.Username : currentUsername;
        const federatedUsername = isFederatedUser ? currentUsername : existingUser.Username;
        
        // Link accounts
        await linkAccounts(nativeUsername, federatedUsername);
        
        console.log('Accounts linked successfully:', {
            email,
            nativeUser: nativeUsername,
            federatedUser: federatedUsername,
            timestamp: new Date().toISOString()
        });
        
        // Return event to allow authentication to proceed
        return event;
        
    } catch (error) {
        console.error('Error in account linking:', {
            error: error.message,
            stack: error.stack,
            username: event.userName,
            email: event.request?.userAttributes?.email
        });
        
        // Critical: Don't block authentication on linking failure
        // User can still access the application, linking will be attempted on next sign-in
        return event;
    }
};

/**
 * Find user by email address
 * @param {string} email - Email address to search for
 * @param {string} excludeUsername - Username to exclude from results (current user)
 * @returns {Object|null} - User object or null if not found
 */
async function findUserByEmail(email, excludeUsername) {
    try {
        const command = new ListUsersCommand({
            UserPoolId: USER_POOL_ID,
            Filter: `email = "${email}"`
        });
        
        const response = await client.send(command);
        
        console.log('ListUsers response:', {
            usersFound: response.Users.length,
            email
        });
        
        // Warn if multiple users found with same email (potential misconfiguration)
        if (response.Users.length > 2) {
            console.warn('Multiple users found with same email - possible misconfiguration', {
                email,
                count: response.Users.length
            });
        }
        
        // Find user that's not the current user
        const otherUser = response.Users.find(user => user.Username !== excludeUsername);
        
        return otherUser || null;
        
    } catch (error) {
        console.error('Error finding user by email:', {
            error: error.message,
            email
        });
        throw error;
    }
}

/**
 * Link federated account to native Cognito account
 * @param {string} nativeUsername - Native Cognito username (destination)
 * @param {string} federatedUsername - Federated username (source)
 */
async function linkAccounts(nativeUsername, federatedUsername) {
    try {
        // Extract provider name and user ID from federated username
        // Format: Google_123456789 or Google_user@example.com
        const parts = federatedUsername.split('_');
        
        if (parts.length < 2) {
            throw new Error(`Invalid federated username format: ${federatedUsername}`);
        }
        
        const providerName = parts[0];
        const providerUserId = parts.slice(1).join('_'); // Handle usernames with underscores
        
        console.log('Linking accounts:', {
            nativeUsername,
            providerName,
            providerUserId
        });
        
        const command = new AdminLinkProviderForUserCommand({
            UserPoolId: USER_POOL_ID,
            DestinationUser: {
                ProviderName: 'Cognito',
                ProviderAttributeValue: nativeUsername
            },
            SourceUser: {
                ProviderName: providerName,
                ProviderAttributeValue: providerUserId
            }
        });
        
        await client.send(command);
        
        console.log('AdminLinkProviderForUser successful');
        
    } catch (error) {
        // Handle already-linked accounts gracefully (idempotent operation)
        if (error.code === 'AliasExistsException' || error.message.includes('already linked')) {
            console.info('Accounts already linked, treating as success', {
                nativeUsername,
                federatedUsername
            });
            return; // Success - accounts already linked
        }
        
        console.error('Error linking accounts:', {
            error: error.message,
            code: error.code,
            nativeUsername,
            federatedUsername
        });
        throw error;
    }
}
