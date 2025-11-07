# Changelog

All notable changes to the Expense Tracker project will be documented in this file.

## [1.6.0] - 2025-11-07

### Added
- **Federated Account Linking**: Automatic linking of email/password and Google OAuth accounts
  - Users with the same verified email can now sign in with either method
  - Accounts are automatically linked on first sign-in with alternate method
  - All data (expenses, projects, AWS credentials) accessible from either sign-in method
  - Single user identity maintained across authentication providers

### Changed
- Enhanced authentication system to support unified user accounts
- Implemented Post-Authentication Lambda trigger for account linking
- Improved security with email verification requirement for linking

### Technical Details
- Lambda: Created post-authentication-link.js for Cognito Post-Authentication trigger
- Lambda: Implements AdminLinkProviderForUser API for account linking
- Lambda: Validates email_verified=true for both accounts before linking
- Lambda: Handles edge cases (race conditions, already-linked accounts, malformed usernames)
- Lambda: Comprehensive error logging with CloudWatch integration
- Lambda: Non-blocking design ensures authentication succeeds even if linking fails
- AWS: Configured Cognito User Pool Post-Authentication trigger
- AWS: Added IAM policy for cognito-idp:ListUsers and cognito-idp:AdminLinkProviderForUser
- Security: Prevents account takeover by requiring verified emails
- Security: Audit logging for all linking attempts
- Code Quality: Perplexity AI review completed with recommendations implemented

### Fixed
- Resolved known limitation from v1.5.0 regarding separate accounts for different auth methods
- Users no longer need to maintain separate accounts for email/password and Google sign-in

### Security
- Email verification strictly enforced before account linking
- Comprehensive audit logging for account linking events
- Idempotent operation prevents duplicate linking attempts
- Graceful handling of already-linked accounts

## [1.5.0] - 2025-11-07

### Added
- **Google OAuth Sign-In**: Users can now sign in using their Google account
  - "Sign in with Google" button added to login page
  - Seamless authentication via AWS Cognito Hosted UI
  - Supports both email/password and Google OAuth authentication methods
  - OAuth flow implemented with authorization code grant for security

### Changed
- Enhanced authentication system to support multiple sign-in methods
- Updated logout functionality to handle both Cognito and federated users
- Improved session management with support for OAuth tokens

### Technical Details
- Frontend: Created oauth.js module for OAuth flow handling
- Frontend: Added Google sign-in button with Google branding guidelines
- Frontend: Implemented OAuth callback handler for authorization code exchange
- Frontend: Updated app.js to support both authentication methods
- Frontend: Added auth divider and Google button styling to styles.css
- Configuration: Added Cognito domain and OAuth redirect URIs to CONFIG
- AWS: Configured Google as identity provider in Cognito User Pool
- AWS: Configured app client OAuth settings with callback URLs

### Known Limitations
- Account linking between email/password and Google accounts not yet implemented
- Will be added in future update via Pre-Authentication Lambda trigger

## [1.3.1] - 2025-11-06

### Fixed
- **CRITICAL:** Fixed CORS issue blocking AWS credentials save operation
  - OPTIONS preflight requests to `/aws-credentials` endpoint were returning 500 error
  - Modified Lambda function to handle OPTIONS requests directly with proper CORS headers
  - Configured API Gateway OPTIONS method with AWS_PROXY integration to Lambda
  - Users can now successfully save AWS IAM credentials for cost tracking

### Changed
- Made Twin Wicks logo clickable on all pages, linking to https://twin-wicks.com
  - Added anchor tags around logo images on login/signup and main header
  - Links open in new tab with security attributes (target="_blank" rel="noopener noreferrer")

### Technical Details
- Lambda: Added OPTIONS handler in aws-credentials.js returning 200 with CORS headers
- API Gateway: Configured OPTIONS method with Lambda integration and permissions
- Frontend: Wrapped logo images in anchor tags in index.html
