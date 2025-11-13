# Changelog

All notable changes to the Expense Tracker project will be documented in this file.

## [3.0.0] - 2025-11-13

### Major Release - Critical Bug Fixes and Feature Enhancements

This release addresses multiple critical issues discovered in production and adds significant improvements to user experience and functionality.

### Fixed - Critical Issues

#### Authentication & Security
- **Google OAuth CSP Violation**: Fixed "failed to fetch" error preventing Google sign-in
  - Added new Cognito v2 domain to Content Security Policy in CloudFront
  - Updated CSP to allow `https://expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com`
  - Reviewed and approved by Perplexity AI for security best practices
  
- **Email Verification Not Sent**: Fixed PreSignUp Lambda auto-confirming all users
  - Modified Lambda to only auto-confirm Google OAuth users
  - Email/password signups now properly require email verification
  - Users receive verification code emails from AWS Cognito

#### User Interface
- **Navigation Buttons Not Working**: Fixed event listeners not attaching after OAuth login
  - Moved navigation initialization to `showMainScreen()` function
  - Added `initializeNavigation()` function with duplicate prevention
  - All nav buttons (Dashboard, Expenses, Projects, Add Expense, Settings) now functional
  
- **Logout Button Not Working**: Fixed same issue as navigation buttons
  - Moved logout initialization to `showMainScreen()` function
  - Added duplicate prevention with `dataset.initialized` flag
  - Logout now properly clears session and returns to login screen

#### Projects Functionality
- **Project UUIDs Displayed**: Fixed dashboard chart showing UUIDs instead of project names
  - Added project caching in frontend (`window.projectCache`)
  - Implemented `getProjectName()` function with API fallback
  - Monthly Spending Trends chart now displays human-readable project names
  - Hover tooltips show project names correctly

- **Project Expense Totals Missing**: Fixed Projects tab showing $0.00 and 0 expenses
  - Added expense aggregation to backend `getProjects` Lambda function
  - Implemented single-query optimization for performance
  - Project cards now display correct `totalAmount` and `expenseCount`

- **Projects Lambda 502 Error**: Fixed ES Module incompatibility
  - Downgraded `uuid` package from v11.x (ES Module) to v9.0.1 (CommonJS)
  - Resolved `ERR_REQUIRE_ESM` error in Node.js 22 Lambda runtime
  - Lambda now initializes and executes successfully

#### Assets
- **Favicon 403 Error**: Fixed missing favicon causing browser errors
  - Added `favicon.ico` (16 KB) from twin-wicks.com bucket
  - Added `favicon.png` (225 KB) high-quality version
  - Updated `index.html` to reference both formats for browser compatibility

### Added - New Features

#### User Experience
- **Login Page FAQ**: Added collapsible help section explaining authentication
  - Explains why Google OAuth users can't log in with email/password
  - Provides step-by-step account linking instructions
  - Includes security tip about Google sign-in benefits
  - Non-intrusive design (collapsed by default)

### Technical Details

#### Frontend Changes
- **Files Modified**:
  - `frontend/index.html` - Added FAQ section, favicon references
  - `frontend/app.js` - Fixed navigation and logout initialization
  - `frontend/dashboard-enhanced.js` - Added project name mapping
  - `frontend/favicon.ico` - Added (16 KB)
  - `frontend/favicon.png` - Added (225 KB)

#### Backend Changes
- **Lambda Functions**:
  - `lambda/presignup-link/index.mjs` - Fixed auto-confirm logic
  - `lambda/projects.js` - Added expense aggregation, fixed uuid dependency

#### Infrastructure Changes
- **CloudFront**: Updated response headers policy with new CSP
  - Policy ID: `b4e0c8b1-9d4a-4d7a-9c49-e0e0e0e0e0e0`
  - Added Cognito v2 domain to `connect-src` directive
  - Maintains backward compatibility with old domain

#### Deployment
- **S3 Bucket**: `expense-tracker-frontend-391907191624`
- **CloudFront Distribution**: Multiple cache invalidations for updated files
- **Lambda Deployments**: 
  - `expense-tracker-prod-projects` with uuid@9.0.1
  - `expense-tracker-prod-presignup-link` with fixed logic

### Code Quality
- All critical fixes reviewed for security and best practices
- Comprehensive error handling added to all modified functions
- Graceful degradation implemented for API failures
- Backward compatibility maintained throughout

### Migration Notes
- **No breaking changes** - All existing functionality preserved
- **No database migrations required**
- **No user action required** - All fixes are transparent to users
- **Rollback available** - v2.0.0 tagged as `v2.0.0-stable` for emergency rollback

### Known Issues Resolved
- ✅ Google OAuth "failed to fetch" error
- ✅ Navigation buttons unresponsive after login
- ✅ Logout button not working
- ✅ Project UUIDs showing in charts
- ✅ Projects tab showing zero expenses
- ✅ Projects Lambda 502 errors
- ✅ Favicon 403 errors
- ✅ Email verification not sent

### Testing Completed
- ✅ Google OAuth login flow
- ✅ Email/password signup with verification
- ✅ All navigation buttons (5 tabs)
- ✅ Logout functionality
- ✅ Dashboard charts with project names
- ✅ Projects tab with expense totals
- ✅ Favicon loading in browsers

---

## [2.0.0] - 2025-11-10

### Major Release - Cognito User Pool Migration

- Migrated to new AWS Cognito User Pool v2
- New User Pool ID: `us-east-1_iSsgMCrkM`
- New Client ID: `6jb82h9lrvh29505t1ihavfte9`
- New Domain: `expense-tracker-prod-v2`
- Fixed "Attribute cannot be updated" error blocking Google OAuth

---

## [1.6.1] - 2025-11-08

### Added
- **Manual Account Linking**: Settings page with "Link Google Account" feature
  - Users can manually link their Google account from settings page
  - OAuth flow with CSRF protection using state parameter
  - Real-time linking status display
  - Secure token exchange via backend Lambda function
  - Email verification enforcement before linking

### Changed
- Replaced automatic Pre-Signup linking with manual user-initiated linking
- Improved OAuth security with state parameter validation
- Enhanced frontend JWT handling with expiry checks
- Added authorization code format validation

### Technical Details
- **Frontend**: Created settings.html page for account management
- **Frontend**: Implemented settings.js with OAuth flow and CSRF protection
- **Frontend**: Added JWT expiry checking before API calls
- **Frontend**: OAuth state parameter generation and validation
- **Frontend**: Authorization code format validation (regex)
- **Backend**: Created link-account Lambda function for manual linking
- **Backend**: Token exchange with Cognito OAuth endpoint
- **Backend**: AdminLinkProviderForUser API integration
- **Backend**: Email verification checks for both accounts
- **Backend**: Comprehensive error handling and user feedback
- **API Gateway**: Added POST /link-account endpoint
- **API Gateway**: CORS configuration for settings page
- **Security**: Perplexity AI review completed for both backend and frontend
- **Security**: CSRF protection via OAuth state parameter
- **Security**: Token expiry validation on frontend
- **Security**: Authorization code format validation
- **Code Quality**: All code reviewed and validated by Perplexity AI

### Fixed
- Resolved OAuth callback errors with immutable email attribute
- Fixed duplicate account creation issues
- Improved error messages for better user experience

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
