# Google OAuth Setup Guide - Step by Step

**Version:** 1.5.0  
**Date:** November 7, 2025

This guide will walk you through setting up Google OAuth authentication for the Expense Tracker application.

## Prerequisites

- Access to AWS Console with permissions to modify Cognito User Pool
- A Google account for creating Google Cloud Console project
- Current Cognito User Pool ID: `us-east-1_7H7R5DVZT`
- Current App Client ID: `pk3l1fkkre0ms4si0prabfavl`

---

## Part 1: AWS Cognito Setup

### Step 1.1: Check and Configure Cognito Domain

First, we need to check if your Cognito User Pool has a domain configured.

1. **Open AWS Cognito Console**
   - Navigate to: https://console.aws.amazon.com/cognito/
   - Region: US East (N. Virginia) - `us-east-1`

2. **Select Your User Pool**
   - Click on "User pools" in the left sidebar
   - Find and click on the user pool with ID: `us-east-1_7H7R5DVZT`

3. **Check Domain Configuration**
   - Click on the "App integration" tab
   - Scroll down to "Domain" section
   - **If a domain is already configured:**
     - Note down the domain name (e.g., `expense-tracker-prod.auth.us-east-1.amazoncognito.com`)
     - Skip to Step 1.2
   - **If no domain is configured:**
     - Click "Actions" → "Create Cognito domain"
     - Enter a domain prefix: `expense-tracker-prod` (or your preferred unique name)
     - Click "Create Cognito domain"
     - Wait for the domain to be created
     - Note down the full domain URL: `https://expense-tracker-prod.auth.us-east-1.amazoncognito.com`

**⚠️ Important:** Write down your Cognito domain URL - you'll need it for Google setup.

---

## Part 2: Google Cloud Console Setup

### Step 2.1: Create a Google Cloud Project

1. **Open Google Cloud Console**
   - Navigate to: https://console.cloud.google.com
   - Sign in with your Google account

2. **Create New Project**
   - Click on the project dropdown at the top (next to "Google Cloud")
   - Click "NEW PROJECT"
   - Project name: `Expense Tracker` (or your preferred name)
   - Organization: Leave as default or select your organization
   - Click "CREATE"
   - Wait for the project to be created
   - Select the newly created project from the dropdown

### Step 2.2: Enable Google+ API (if required)

1. **Navigate to APIs & Services**
   - From the left menu, click "APIs & Services" → "Library"
   - Search for "Google+ API"
   - If not enabled, click on it and click "ENABLE"

### Step 2.3: Configure OAuth Consent Screen

1. **Navigate to OAuth Consent Screen**
   - From the left menu, click "APIs & Services" → "OAuth consent screen"

2. **Choose User Type**
   - Select "External" (unless you have a Google Workspace organization)
   - Click "CREATE"

3. **Fill in App Information**
   - **App name:** `Expense Tracker`
   - **User support email:** Select your email from the dropdown
   - **App logo:** (Optional) You can upload the Twin Wicks logo later
   - **Application home page:** `https://app.twin-wicks.com`
   - **Application privacy policy link:** (Optional) Add if you have one
   - **Application terms of service link:** (Optional) Add if you have one
   - **Authorized domains:** 
     - Click "ADD DOMAIN"
     - Enter: `twin-wicks.com`
     - Click "ADD DOMAIN" again
     - Enter: `amazoncognito.com`
   - **Developer contact information:** Enter your email address
   - Click "SAVE AND CONTINUE"

4. **Scopes**
   - Click "ADD OR REMOVE SCOPES"
   - Select the following scopes:
     - `.../auth/userinfo.email` - View your email address
     - `.../auth/userinfo.profile` - See your personal info
     - `openid` - Associate you with your personal info
   - Click "UPDATE"
   - Click "SAVE AND CONTINUE"

5. **Test Users** (Optional)
   - You can add test users if you want to test before publishing
   - Click "SAVE AND CONTINUE"

6. **Summary**
   - Review your settings
   - Click "BACK TO DASHBOARD"

### Step 2.4: Create OAuth 2.0 Credentials

1. **Navigate to Credentials**
   - From the left menu, click "APIs & Services" → "Credentials"

2. **Create OAuth Client ID**
   - Click "CREATE CREDENTIALS" at the top
   - Select "OAuth client ID"

3. **Configure OAuth Client**
   - **Application type:** Select "Web application"
   - **Name:** `Expense Tracker - Cognito`
   
4. **Add Authorized JavaScript Origins**
   - Click "ADD URI" under "Authorized JavaScript origins"
   - Enter: `https://app.twin-wicks.com`
   - Click "ADD URI" again
   - Enter: `https://[YOUR-COGNITO-DOMAIN].auth.us-east-1.amazoncognito.com`
     - Replace `[YOUR-COGNITO-DOMAIN]` with the domain prefix you noted in Step 1.1
     - Example: `https://expense-tracker-prod.auth.us-east-1.amazoncognito.com`

5. **Add Authorized Redirect URIs**
   - Click "ADD URI" under "Authorized redirect URIs"
   - Enter: `https://[YOUR-COGNITO-DOMAIN].auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
     - Replace `[YOUR-COGNITO-DOMAIN]` with your domain prefix
     - Example: `https://expense-tracker-prod.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
   - Click "ADD URI" again
   - Enter: `https://app.twin-wicks.com/callback`

6. **Create**
   - Click "CREATE"
   - A dialog will appear with your credentials

7. **Save Your Credentials**
   - **⚠️ IMPORTANT:** Copy and save these values securely:
     - **Client ID** (looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)
     - **Client Secret** (looks like: `GOCSPX-abcdefghijklmnop`)
   - Click "OK"

**⚠️ Critical:** Keep these credentials secure. You'll need them for the next step.

---

## Part 3: Add Google to AWS Cognito

### Step 3.1: Add Google as Identity Provider

1. **Return to AWS Cognito Console**
   - Navigate back to your User Pool: `us-east-1_7H7R5DVZT`

2. **Navigate to Identity Providers**
   - Click on "Sign-in experience" tab
   - Scroll down to "Federated identity provider sign-in"
   - Click "Add identity provider"

3. **Configure Google Provider**
   - Select "Google"
   - **Client ID:** Paste the Client ID from Google (Step 2.4)
   - **Client secret:** Paste the Client Secret from Google (Step 2.4)
   - **Authorized scopes:** Enter `profile email openid`
   - **Map attributes between Google and your user pool:**
     - Leave as default (email → email, name → name)
   - Click "Add identity provider"

### Step 3.2: Configure App Client for OAuth

1. **Navigate to App Clients**
   - Still in your User Pool, click on "App integration" tab
   - Scroll down to "App clients and analytics"
   - Click on your app client: `pk3l1fkkre0ms4si0prabfavl`

2. **Edit Hosted UI Settings**
   - Scroll down to "Hosted UI" section
   - Click "Edit"

3. **Configure OAuth Settings**
   - **Allowed callback URLs:**
     - Add: `https://app.twin-wicks.com/callback`
     - Keep any existing URLs if present
   
   - **Allowed sign-out URLs:**
     - Add: `https://app.twin-wicks.com`
     - Keep any existing URLs if present
   
   - **Identity providers:**
     - Check ✅ "Cognito user pool"
     - Check ✅ "Google"
   
   - **OAuth 2.0 grant types:**
     - Check ✅ "Authorization code grant"
     - Uncheck "Implicit grant" (not needed)
   
   - **OpenID Connect scopes:**
     - Check ✅ `openid`
     - Check ✅ `email`
     - Check ✅ `profile`
     - Check ✅ `aws.cognito.signin.user.admin`

4. **Save Changes**
   - Click "Save changes" at the bottom

### Step 3.3: Configure Attribute Mapping (for Account Linking)

1. **Navigate to Attribute Mapping**
   - In your User Pool, click on "Sign-in experience" tab
   - Scroll to "Federated identity provider sign-in"
   - Click on "Google" provider you just added

2. **Configure Attribute Mapping**
   - Ensure the following mappings are set:
     - Google attribute `email` → User pool attribute `email`
     - Google attribute `name` → User pool attribute `name`
     - Google attribute `sub` → User pool attribute `username` (or custom attribute)
   - Click "Save changes"

3. **Enable Account Linking**
   - Go to "Sign-in experience" tab
   - Scroll to "Attribute verification and user account confirmation"
   - Under "Link federated users", select:
     - **Link federated users based on:** `Email`
   - This will automatically link Google accounts to existing email/password accounts with the same email
   - Click "Save changes"

---

## Part 4: Verification Checklist

Before proceeding, verify you have completed all steps:

- ✅ Cognito domain is configured
- ✅ Google Cloud project created
- ✅ OAuth consent screen configured
- ✅ OAuth 2.0 credentials created
- ✅ Google added as identity provider in Cognito
- ✅ App client OAuth settings configured
- ✅ Attribute mapping configured
- ✅ Account linking enabled

---

## Part 5: Information to Provide to Manus

Once you've completed all the above steps, provide the following information:

1. **Cognito Domain URL**
   - Example: `https://expense-tracker-prod.auth.us-east-1.amazoncognito.com`

2. **Google Client ID**
   - Example: `123456789-abcdefghijklmnop.apps.googleusercontent.com`

3. **Google Client Secret**
   - Example: `GOCSPX-abcdefghijklmnop`
   - ⚠️ Note: This will NOT be stored in git. It will be used only for verification.

4. **Confirmation**
   - Confirm that account linking is enabled based on email

---

## Troubleshooting

### Issue: "Domain prefix already exists"
**Solution:** Choose a different domain prefix (e.g., `expense-tracker-app`, `twinwicks-expense-tracker`)

### Issue: "Authorized domain not verified"
**Solution:** Make sure you added both `twin-wicks.com` and `amazoncognito.com` to authorized domains in Google OAuth consent screen

### Issue: "Redirect URI mismatch"
**Solution:** Double-check that the redirect URI in Google exactly matches the Cognito domain callback URL

### Issue: Can't find User Pool ID
**Solution:** The User Pool ID is `us-east-1_7H7R5DVZT` - search for this in the Cognito console

---

## Security Notes

- The Client Secret will be stored securely in AWS (not in git repository)
- Only request necessary OAuth scopes (email, profile, openid)
- All OAuth redirects use HTTPS
- Account linking is based on verified email addresses
- Users can still sign in with email/password if they prefer

---

## Next Steps

After you provide the information from Part 5, I will:
1. Implement the frontend Google OAuth integration
2. Add "Sign in with Google" button to the login page
3. Create the OAuth callback handler
4. Test both authentication methods
5. Deploy to production
6. Update documentation

**Estimated implementation time:** 1-2 hours after receiving the configuration details.

