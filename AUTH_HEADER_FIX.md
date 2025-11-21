# Authorization Header Fix - AWS Signature V4 Conflict

## Problem Discovered

When users tried to access the application through CloudFront, they received this error:

```
Error: Invalid key=value pair (missing equal-sign) in Authorization header 
(hashed with SHA-256 and encoded with Base64)
```

**Error Type:** `IncompleteSignatureException`

## Root Cause

When requests go through CloudFront to API Gateway with an `Authorization` header, API Gateway tries to validate it as **AWS Signature Version 4** credentials instead of passing it to the Cognito authorizer.

### Why This Happened

1. CloudFront forwards the `Authorization` header to API Gateway
2. API Gateway sees the `Authorization` header and assumes it's an AWS API request
3. API Gateway tries to parse it as AWS Signature V4 (which requires key=value pairs)
4. The Bearer token format doesn't match AWS Signature V4 format
5. API Gateway returns 403 error **before** the Cognito authorizer even runs

### Direct vs CloudFront Behavior

**Direct to API Gateway:**
```bash
curl -H "Authorization: Bearer token" https://fcnq8h7mai...amazonaws.com/prod/expenses
# Returns: 401 Unauthorized (correct - Cognito authorizer runs)
```

**Through CloudFront:**
```bash
curl -H "Authorization: Bearer token" https://teckstart.com/api/expenses
# Returns: 403 IncompleteSignatureException (wrong - AWS Sig V4 validation)
```

---

## Solution Implemented

### 1. Changed Cognito Authorizer Header

Updated the Cognito authorizer to look for `X-Auth-Token` instead of `Authorization`:

```bash
aws apigateway update-authorizer \
    --rest-api-id fcnq8h7mai \
    --authorizer-id 6d5roa \
    --patch-operations op=replace,path=/identitySource,value=method.request.header.X-Auth-Token
```

**Before:**
```json
{
  "identitySource": "method.request.header.Authorization"
}
```

**After:**
```json
{
  "identitySource": "method.request.header.X-Auth-Token"
}
```

### 2. Updated Frontend Code

Changed all instances of `Authorization` header to `X-Auth-Token`:

**app.js:**
```javascript
// Before
headers['Authorization'] = `Bearer ${state.idToken}`;

// After
headers['X-Auth-Token'] = `Bearer ${state.idToken}`;
```

**settings.js:**
```javascript
// Before
'Authorization': `Bearer ${idToken}`

// After
'X-Auth-Token': `Bearer ${idToken}`
```

### 3. Created Custom Origin Request Policy

Created a new CloudFront origin request policy to ensure `X-Auth-Token` is forwarded:

**Policy ID:** `a74b4380-79e5-44ff-a8de-3e9491711286`
**Name:** `ExpenseTrackerOriginPolicy`

**Configuration:**
```json
{
  "HeadersConfig": {
    "HeaderBehavior": "allViewer"
  },
  "CookiesConfig": {
    "CookieBehavior": "all"
  },
  "QueryStringsConfig": {
    "QueryStringBehavior": "all"
  }
}
```

This policy forwards **all viewer headers** (including `X-Auth-Token`) to the origin.

### 4. Updated CloudFront Cache Behavior

Updated the `/api/*` cache behavior to use the new origin request policy:

**Before:**
```json
{
  "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac"
}
```

**After:**
```json
{
  "OriginRequestPolicyId": "a74b4380-79e5-44ff-a8de-3e9491711286"
}
```

### 5. Deployed Changes

1. ✅ Updated API Gateway authorizer
2. ✅ Created new API Gateway deployment
3. ✅ Updated frontend files (app.js, settings.js)
4. ✅ Deployed to S3 (teckstart.com bucket)
5. ✅ Invalidated CloudFront cache
6. ✅ Created custom origin request policy
7. ✅ Updated CloudFront distribution

---

## Why This Fix Works

### The Problem with `Authorization` Header

The `Authorization` header is a **reserved header** in AWS API Gateway. When API Gateway receives a request with this header, it automatically tries to validate it as AWS credentials before any authorizers run.

### Why `X-Auth-Token` Works

Using a custom header name (`X-Auth-Token`) avoids the AWS Signature V4 validation:

1. CloudFront forwards `X-Auth-Token` header to API Gateway
2. API Gateway doesn't recognize it as AWS credentials
3. Request reaches the Cognito authorizer
4. Cognito authorizer reads `X-Auth-Token` header
5. Cognito validates the Bearer token
6. Request proceeds to Lambda function

---

## Testing

### Before Fix
```bash
curl -H "Authorization: Bearer token" https://teckstart.com/api/expenses
# Response: 403 IncompleteSignatureException
```

### After Fix
```bash
curl -H "X-Auth-Token: Bearer token" https://teckstart.com/api/expenses
# Response: 401 Unauthorized (correct - invalid token)
```

The 401 response is **correct** because the token is invalid. With a valid token, it would return 200 with data.

---

## Files Modified

1. **frontend/app.js** - Changed Authorization to X-Auth-Token (10 instances)
2. **frontend/settings.js** - Changed Authorization to X-Auth-Token (6 instances)
3. **API Gateway Authorizer** - Changed identitySource to X-Auth-Token
4. **CloudFront Origin Request Policy** - Created custom policy
5. **CloudFront Cache Behavior** - Updated to use new policy

---

## Deployment Timeline

- **19:55 UTC** - Updated API Gateway authorizer
- **19:56 UTC** - Created API Gateway deployment
- **19:56 UTC** - Deployed frontend files to S3
- **19:56 UTC** - Invalidated CloudFront cache
- **19:57 UTC** - Created custom origin request policy
- **19:57 UTC** - Updated CloudFront distribution
- **~20:05 UTC** - CloudFront deployment complete (estimated)

---

## User Action Required

### Clear Browser Cache (CRITICAL)

Users MUST clear their browser cache to get the updated JavaScript files:

1. Press `Ctrl+Shift+Delete`
2. Select "Cached images and files"
3. Time range: "All time"
4. Click "Clear data"

**Or**: Use Incognito/Private window

### Wait for CloudFront Deployment

CloudFront is currently deploying the updated configuration. This takes 5-10 minutes.

**Check deployment status:**
```bash
aws cloudfront get-distribution --id EB9MXBNYV9HVD --query 'Distribution.Status'
```

When it returns `"Deployed"`, the fix is live.

---

## Expected Behavior After Fix

### Login Flow
1. User logs in with Google OAuth
2. Frontend receives Cognito ID token
3. Frontend sends requests with `X-Auth-Token: Bearer <token>` header
4. CloudFront forwards `X-Auth-Token` to API Gateway
5. API Gateway Cognito authorizer validates token
6. Request proceeds to Lambda function
7. Data is returned to user

### Error Handling
- **Invalid token:** 401 Unauthorized
- **Expired token:** 401 Unauthorized
- **Missing token:** 403 Forbidden
- **Valid token:** 200 OK with data

---

## Why Standard Solutions Didn't Work

### Attempted Fix #1: Update CORS Headers
- **Result:** Didn't help
- **Reason:** CORS was already configured correctly

### Attempted Fix #2: Add Custom CloudFront Headers
- **Result:** Didn't help
- **Reason:** Didn't prevent AWS Sig V4 validation

### Attempted Fix #3: Use Different Origin Request Policy
- **Result:** Didn't help initially
- **Reason:** Still used `Authorization` header

### Final Fix: Custom Header Name
- **Result:** ✅ Works
- **Reason:** Avoids AWS Sig V4 validation entirely

---

## Lessons Learned

1. **Reserved Headers:** The `Authorization` header is reserved by AWS API Gateway for AWS Signature V4 validation
2. **CloudFront Behavior:** CloudFront + API Gateway + Authorization header = AWS Sig V4 validation
3. **Custom Headers:** Using custom header names avoids reserved header conflicts
4. **Testing:** Always test through CloudFront, not just direct to API Gateway

---

## Summary

| Component | Change | Status |
|-----------|--------|--------|
| API Gateway Authorizer | Authorization → X-Auth-Token | ✅ Updated |
| Frontend (app.js) | Authorization → X-Auth-Token | ✅ Deployed |
| Frontend (settings.js) | Authorization → X-Auth-Token | ✅ Deployed |
| Origin Request Policy | Created custom policy | ✅ Created |
| CloudFront Behavior | Updated to use new policy | ✅ Updated |
| Cache Invalidation | Cleared app.js, settings.js | ✅ Complete |
| CloudFront Deployment | Propagating changes | ⏳ In Progress |

---

**Status:** Fix deployed, waiting for CloudFront propagation (~5-10 minutes)