# Google OAuth Setup - Quick Reference Card

## Your Current Configuration

- **User Pool ID:** `us-east-1_7H7R5DVZT`
- **App Client ID:** `pk3l1fkkre0ms4si0prabfavl`
- **Region:** `us-east-1`
- **App URL:** `https://app.twin-wicks.com`
- **Callback URL:** `https://app.twin-wicks.com/callback`

## Setup Sequence

### 1. AWS Cognito - Configure Domain
- Go to: AWS Cognito Console → User Pools → `us-east-1_7H7R5DVZT` → App integration → Domain
- Create domain prefix (e.g., `expense-tracker-prod`)
- **Save the domain URL** (e.g., `https://expense-tracker-prod.auth.us-east-1.amazoncognito.com`)

### 2. Google Cloud - Create Project & OAuth Credentials
- Go to: https://console.cloud.google.com
- Create project: "Expense Tracker"
- Configure OAuth consent screen:
  - User type: External
  - App name: Expense Tracker
  - Authorized domains: `twin-wicks.com`, `amazoncognito.com`
  - Scopes: email, profile, openid
- Create OAuth credentials:
  - Type: Web application
  - Authorized origins: `https://app.twin-wicks.com`, `https://[COGNITO-DOMAIN].auth.us-east-1.amazoncognito.com`
  - Redirect URIs: `https://[COGNITO-DOMAIN].auth.us-east-1.amazoncognito.com/oauth2/idpresponse`, `https://app.twin-wicks.com/callback`
- **Save Client ID and Client Secret**

### 3. AWS Cognito - Add Google Provider
- Go to: User Pool → Sign-in experience → Add identity provider → Google
- Enter Client ID and Client Secret from Google
- Scopes: `profile email openid`

### 4. AWS Cognito - Configure App Client
- Go to: App integration → App clients → `pk3l1fkkre0ms4si0prabfavl` → Edit
- Callback URLs: `https://app.twin-wicks.com/callback`
- Sign-out URLs: `https://app.twin-wicks.com`
- Identity providers: ✅ Cognito user pool, ✅ Google
- OAuth grant types: ✅ Authorization code grant
- Scopes: ✅ openid, ✅ email, ✅ profile, ✅ aws.cognito.signin.user.admin

### 5. AWS Cognito - Enable Account Linking
- Go to: Sign-in experience → Attribute verification
- Link federated users based on: **Email**

## Information to Provide After Setup

```
Cognito Domain: https://[YOUR-DOMAIN].auth.us-east-1.amazoncognito.com
Google Client ID: [YOUR-CLIENT-ID].apps.googleusercontent.com
Google Client Secret: GOCSPX-[YOUR-SECRET]
```

## URLs You'll Need

| Purpose | URL Template | Your URL |
|---------|-------------|----------|
| Cognito Domain | `https://[PREFIX].auth.us-east-1.amazoncognito.com` | _Fill after Step 1_ |
| Google Redirect URI | `https://[COGNITO-DOMAIN].auth.us-east-1.amazoncognito.com/oauth2/idpresponse` | _Fill after Step 1_ |
| App Callback | `https://app.twin-wicks.com/callback` | ✅ Fixed |
| App Sign-out | `https://app.twin-wicks.com` | ✅ Fixed |

## Common Issues

| Issue | Solution |
|-------|----------|
| Domain prefix taken | Try: `expense-tracker-app`, `twinwicks-expenses`, etc. |
| Redirect URI mismatch | Ensure exact match including `/oauth2/idpresponse` |
| Authorized domain error | Add both `twin-wicks.com` AND `amazoncognito.com` |
| Can't find user pool | Search for ID: `us-east-1_7H7R5DVZT` |

## Testing After Implementation

1. Visit `https://app.twin-wicks.com`
2. Click "Sign in with Google"
3. Authorize with Google account
4. Should redirect to dashboard
5. Test sign-out and sign-in again

