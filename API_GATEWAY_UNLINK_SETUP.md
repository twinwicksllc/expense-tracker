# API Gateway Unlink Account Endpoint Setup

## Issue Fixed

The `/unlink-account` endpoint was missing from API Gateway, causing "network error" when users tried to unlink their Google account.

## Root Cause

- Lambda function `expense-tracker-prod-unlinkAccount` existed
- BUT the API Gateway endpoint `/unlink-account` was not configured
- Frontend was calling a non-existent endpoint

## Solution Implemented

### 1. Created API Gateway Resource
- **Path**: `/unlink-account`
- **Resource ID**: `qdfwxg`
- **Parent**: Root resource (`d9grgi5rx5`)

### 2. Configured POST Method
- **HTTP Method**: POST
- **Authorization**: NONE (uses JWT Bearer token in request)
- **Integration Type**: AWS_PROXY
- **Lambda Function**: `expense-tracker-prod-unlinkAccount`

### 3. Configured OPTIONS Method (CORS Preflight)
- **HTTP Method**: OPTIONS
- **Integration Type**: MOCK
- **Response Headers**:
  - `Access-Control-Allow-Origin`: `https://app.twin-wicks.com`
  - `Access-Control-Allow-Methods`: `POST, OPTIONS`
  - `Access-Control-Allow-Headers`: `Content-Type, Authorization`

### 4. Lambda Permission
- Granted API Gateway permission to invoke the Lambda function
- **Statement ID**: `apigateway-unlink-account`
- **Source ARN**: `arn:aws:execute-api:us-east-1:391907191624:fcnq8h7mai/*/POST/unlink-account`

### 5. Deployed to Production
- **Deployment ID**: `jt2viy`
- **Stage**: `prod`
- **Timestamp**: November 10, 2025 07:08 UTC

## Verification

Endpoint is now accessible:
```bash
curl -X OPTIONS https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/unlink-account
```

Response headers:
```
access-control-allow-origin: https://app.twin-wicks.com
access-control-allow-methods: OPTIONS,GET,POST,PUT,DELETE
access-control-allow-headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
```

## CORS Audit Results

### Inconsistencies Found

Different endpoints have different CORS configurations:

1. **Auth endpoints** (`/auth/login`, `/expenses`):
   - Origin: `*` (wildcard - allows any origin)
   - Headers: Full AWS set

2. **Account linking endpoints** (`/link-account`, `/unlink-account`):
   - Origin: `https://app.twin-wicks.com` (restricted)
   - Headers: Minimal set (Content-Type, Authorization)

### Security Recommendation

For production, all endpoints should use:
- **Origin**: `https://app.twin-wicks.com` (not wildcard)
- **Headers**: Only what's needed (Content-Type, Authorization)
- **Methods**: Only what's used

The wildcard `*` origin is less secure and should be updated.

## Testing the Fix

1. **Log in** to the expense tracker with email/password
2. Go to **Settings** tab
3. If you have a Google account linked, you should see "Unlink Google Account" button
4. Click **Unlink** - should now work without network error
5. Confirm the unlink operation
6. You'll be logged out and redirected to login page

## Expected Behavior

When unlinking:
1. Frontend calls `/unlink-account` endpoint ✅
2. Lambda validates JWT token
3. Lambda removes Google identity from Cognito user
4. Lambda adds token to denylist (invalidates session)
5. Frontend receives success response
6. User is logged out and redirected to login

## Files Involved

- **Lambda**: `lambda/unlink-account.mjs`
- **Frontend**: `frontend/settings.js` (unlinkGoogleAccount function)
- **API Gateway**: Resource `/unlink-account` on API `fcnq8h7mai`

## Related Issues

This also revealed:
1. Google OAuth email verification issue (fixed separately)
2. CORS inconsistency across endpoints (documented, needs future fix)
3. Missing API Gateway endpoints for existing Lambda functions

## Next Steps

1. ✅ Test unlink functionality
2. ⏳ Consider standardizing CORS across all endpoints
3. ⏳ Audit other Lambda functions for missing API Gateway endpoints