import { 
  CognitoIdentityProviderClient, 
  ListUsersCommand, 
  AdminLinkProviderForUserCommand,
  AdminDeleteUserCommand
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: "us-east-1" });

/**
 * Pre-Signup Lambda trigger for automatic Google OAuth account linking
 * 
 * This function runs BEFORE a federated user is created, allowing us to:
 * 1. Find existing email/password accounts with the same email
 * 2. Delete any stale Google_ users from previous failed attempts
 * 3. Link the Google identity to the existing account
 * 4. Allow sign-in to proceed to the existing account (no duplicate created)
 * 
 * CRITICAL: Google IdP must have "Overwrite attributes on sign-in" DISABLED
 */

export const handler = async (event) => {
  const userPoolId = process.env.USER_POOL_ID || event.userPoolId;
  const trigger = event.triggerSource;

  // Always set these defaults for social signups
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;

  // Only act for external IdPs (Google, etc.)
  if (trigger !== 'PreSignUp_ExternalProvider') {
    console.log(`Trigger is ${trigger}, not PreSignUp_ExternalProvider. Skipping.`);
    return event;
  }

  // event.userName looks like: "Google_113592101542572736063"
  const userName = event.userName || '';
  const firstUnderscore = userName.indexOf('_');
  
  if (firstUnderscore === -1) {
    console.log('userName format unexpected (no underscore). Skipping.');
    return event;
  }
  
  const provider = userName.substring(0, firstUnderscore);
  const providerUserId = userName.substring(firstUnderscore + 1);
  const email = (event.request.userAttributes.email || '').trim();

  if (!email) {
    console.log('No email from provider. Allowing signup to proceed.');
    return event;
  }

  console.log(`Processing federated signup - Provider: ${provider}, Email: ${email}, ProviderUserId: ${providerUserId}`);

  try {
    // 1) Find existing (non-external) user by email
    const listCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`
    });
    
    const { Users } = await cognitoClient.send(listCommand);

    // Prefer a native Cognito (non-EXTERNAL_PROVIDER) account (email/password)
    const existingUser = Users && Users.length > 0 
      ? Users.find(u => u.UserStatus !== 'EXTERNAL_PROVIDER') || null
      : null;

    // If no existing native user, allow Cognito to create a new federated user normally
    if (!existingUser) {
      console.log(`No existing email/password user found for ${email}. Allowing new federated user creation.`);
      return event;
    }

    console.log(`Found existing user: ${existingUser.Username}`);

    // 2) Delete stale federated user if it exists from a prior failed attempt
    try {
      await cognitoClient.send(new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: userName
      }));
      console.log(`Deleted stale federated user: ${userName}`);
    } catch (deleteError) {
      if (deleteError.name !== 'UserNotFoundException') {
        console.log(`adminDeleteUser non-fatal: ${deleteError.name} - ${deleteError.message}`);
      }
    }

    // 3) Link Google identity to the existing Cognito user by sub
    const subAttr = existingUser.Attributes.find(a => a.Name === 'sub');
    const destSub = subAttr ? subAttr.Value : null;
    
    if (!destSub) {
      console.log('No sub on destination user—cannot link. Allowing signup to proceed.');
      return event;
    }

    try {
      await cognitoClient.send(new AdminLinkProviderForUserCommand({
        UserPoolId: userPoolId,
        DestinationUser: {
          ProviderName: 'Cognito',
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: destSub
        },
        SourceUser: {
          ProviderName: provider,
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: providerUserId
        }
      }));

      console.log(`✅ Successfully linked ${provider}:${providerUserId} -> Cognito user ${destSub}`);
    } catch (linkError) {
      // If linking fails due to already-linked identity, we still let the flow proceed
      console.log(`adminLinkProviderForUser non-fatal: ${linkError.name} - ${linkError.message}`);
    }

    // 4) Return event normally - DO NOT throw error
    // Cognito will sign the user into the existing account
    console.log('Returning event to complete sign-in to existing account');
    return event;

  } catch (error) {
    // For unexpected errors, log but allow signup to proceed
    console.error('Unexpected error in Pre-Signup trigger:', error);
    return event;
  }
};
