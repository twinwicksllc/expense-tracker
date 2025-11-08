import { 
  CognitoIdentityProviderClient, 
  ListUsersCommand, 
  AdminLinkProviderForUserCommand 
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: "us-east-1" });

/**
 * Retry helper for transient AWS errors
 */
async function retry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Retry attempt ${i + 1} after error:`, error.message);
      await new Promise(res => setTimeout(res, 100 * (i + 1)));
    }
  }
}

/**
 * Basic email validation
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export const handler = async (event) => {
  // This function is triggered before a new user is signed up.
  // We use it to link a federated identity (e.g., Google) to an existing
  // user with a matching email address.
  
  console.log("Pre-Signup trigger invoked for:", event.triggerSource);

  // Skip if the trigger is not for a federated sign-up
  if (event.triggerSource !== "PreSignUp_ExternalProvider") {
    console.log("Trigger is not for an external provider. Skipping.");
    return event;
  }

  const { userPoolId, userName } = event;
  const { email } = event.request.userAttributes;

  // Validate email exists and is properly formatted
  if (!email || !isValidEmail(email)) {
    console.log("No valid email found in user attributes. Skipping.");
    return event;
  }

  // Robust provider name parsing using regex
  // Expected format: "ProviderName_ProviderUserId" (e.g., "Google_113592101542572736063")
  const match = userName.match(/^([^_]+)_(.+)$/);
  if (!match) {
    console.log("userName format unexpected. Skipping.");
    return event;
  }
  
  const providerName = match[1];
  const providerUserId = match[2];

  console.log(`Processing federated signup - Provider: ${providerName}, Email: ${email}`);

  try {
    // 1. Find if a user with the same email already exists in the pool
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 1,
    });
    
    const { Users } = await retry(() => cognitoClient.send(listUsersCommand));

    // 2. If an existing user is found, link the new provider to them
    if (Users && Users.length > 0) {
      const existingUser = Users[0];
      
      // Security check: Verify the existing user's email is verified
      const emailVerified = existingUser.Attributes.find(attr => attr.Name === 'email_verified')?.Value;
      if (emailVerified !== 'true') {
        console.log(`Existing user's email is not verified. Skipping linking for security. Username: ${existingUser.Username}`);
        // Allow new user creation since existing account is not verified
        return event;
      }

      const existingUserSub = existingUser.Attributes.find(attr => attr.Name === 'sub')?.Value;
      console.log(`Found verified existing user - Username: ${existingUser.Username}, Sub: ${existingUserSub}`);

      // Link the federated identity to the existing user
      const linkProviderCommand = new AdminLinkProviderForUserCommand({
        UserPoolId: userPoolId,
        DestinationUser: {
          ProviderName: "Cognito", // The existing user is a local Cognito user
          ProviderAttributeValue: existingUser.Username,
        },
        SourceUser: {
          ProviderName: providerName, // e.g., "Google"
          ProviderAttributeName: "Cognito_Subject",
          ProviderAttributeValue: providerUserId,
        },
      });

      try {
        await retry(() => cognitoClient.send(linkProviderCommand));
        console.log(`Successfully linked ${providerName} identity to existing user ${existingUser.Username}`);
      } catch (linkError) {
        console.error("Failed to link provider:", linkError);
        // Do not allow user creation if linking fails
        throw new Error("Failed to link Google account to your existing account. Please try again later or contact support.");
      }

      // 3. IMPORTANT: Throw an error to prevent Cognito from creating a new duplicate user.
      // The link is already created. The user will be redirected to the login page,
      // and their next sign-in attempt with Google will succeed.
      throw new Error("Account already exists. Your Google account has been linked. Please sign in again.");
      
    } else {
      // 4. If no user is found, this is a new user. Allow them to be created.
      console.log(`No existing user found with email ${email}. Allowing new user creation.`);
      return event;
    }
    
  } catch (error) {
    // If the error is the one we threw on purpose, re-throw it to stop the signup
    if (error.message.includes("Account already exists") || error.message.includes("Failed to link")) {
      console.log("Re-throwing intentional error to prevent duplicate user creation");
      throw error;
    }
    
    // For unexpected errors, throw to prevent user creation and avoid data inconsistency
    console.error("An unexpected error occurred:", error);
    throw new Error("An unexpected error occurred during sign-up. Please try again later.");
  }
};
