# CloudFront API Proxy Fix - Chrome Private Network Access Issue

## Problem
Chrome's Private Network Access (PNA) policy was blocking all API requests with the error:
```
Permission was denied for this request to access the `unknown` address space
```

This occurred because:
1. The frontend (teckstart.com) is served from CloudFront (public)
2. The API Gateway (fcnq8h7mai.execute-api.us-east-1.amazonaws.com) is treated as "unknown" address space
3. Chrome blocks cross-address-space requests for security

## Solution: CloudFront API Proxy

Instead of making direct requests to API Gateway, we now proxy all API requests through CloudFront using the `/api/*` path pattern.

### Architecture Change

**Before:**
```
Browser → https://teckstart.com (CloudFront) → S3 (frontend files)
Browser → https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod (API Gateway) ❌ BLOCKED
```

**After:**
```
Browser → https://teckstart.com (CloudFront) → S3 (frontend files)
Browser → https://teckstart.com/api/* (CloudFront) → API Gateway ✅ WORKS
```

### Changes Made

#### 1. CloudFront Configuration
Added new origin and cache behavior:

**New Origin:**
- **Origin ID**: API-Gateway-prod
- **Domain**: fcnq8h7mai.execute-api.us-east-1.amazonaws.com
- **Origin Path**: /prod
- **Protocol**: HTTPS only

**New Cache Behavior:**
- **Path Pattern**: /api/*
- **Target Origin**: API-Gateway-prod
- **Allowed Methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
- **Cache Policy**: CachingDisabled (4135ea2d-6df8-44a3-9df3-4b5a84be39ad)
- **Origin Request Policy**: AllViewerExceptHostHeader (b689b0a8-53d0-40ab-baf2-68738e2966ac)
- **Viewer Protocol**: Redirect to HTTPS
- **Compress**: Enabled

#### 2. Frontend Configuration
Updated API base URLs in all files:

**app.js:**
```javascript
// Before
API_BASE_URL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod'

// After
API_BASE_URL: '/api'
```

**index.html:**
```javascript
// Before
window.API_BASE_URL = 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod';

// After
window.API_BASE_URL = '/api';
```

**settings.js:**
```javascript
// Before
const API_GATEWAY_URL = 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod';

// After
const API_GATEWAY_URL = '/api';
```

### URL Mapping

All API requests are now relative to the CloudFront domain:

| Frontend Request | CloudFront Path | API Gateway Endpoint |
|-----------------|-----------------|---------------------|
| `/api/expenses` | `/api/expenses` | `/prod/expenses` |
| `/api/projects` | `/api/projects` | `/prod/projects` |
| `/api/dashboard` | `/api/dashboard` | `/prod/dashboard` |
| `/api/user` | `/api/user` | `/prod/user` |

CloudFront automatically strips `/api` and forwards to API Gateway with `/prod` prefix.

### Deployment Details

**CloudFront Distribution:**
- **ID**: EB9MXBNYV9HVD
- **Status**: Deployed
- **ETag**: E2MM0YJK1SOS5B (before update)

**S3 Deployment:**
- Updated: app.js, index.html, settings.js
- Cache-Control: no-cache, no-store, must-revalidate

**Cache Invalidation:**
- **ID**: I8YX3BAOO3P65D2A09GQLP2KD6
- **Paths**: /app.js, /index.html, /settings.js
- **Status**: InProgress

### Benefits

1. **Resolves PNA Issue**: All requests now come from same origin (teckstart.com)
2. **Better Security**: No CORS issues, same-origin policy satisfied
3. **Improved Performance**: CloudFront edge caching for API responses
4. **Simplified URLs**: Relative paths instead of absolute URLs
5. **Future-Proof**: Works with all browsers, not just Chrome

### Testing Instructions

**Wait Time:** 5-10 minutes for CloudFront to fully deploy changes

**Test Steps:**
1. Clear browser cache completely (Ctrl+Shift+Delete)
2. Navigate to https://teckstart.com
3. Login with Google OAuth
4. Check browser console (F12) - should see NO errors
5. Dashboard should load expenses
6. All tabs (Dashboard, Expenses, Projects) should work

**Expected Network Requests:**
```
GET https://teckstart.com/api/expenses
GET https://teckstart.com/api/projects
GET https://teckstart.com/api/dashboard
```

All requests should succeed with 200 status codes.

### Troubleshooting

**If still not working after 10 minutes:**

1. **Check CloudFront Status:**
   ```bash
   aws cloudfront get-distribution --id EB9MXBNYV9HVD --query 'Distribution.Status'
   ```
   Should return "Deployed"

2. **Check Cache Invalidation:**
   ```bash
   aws cloudfront get-invalidation --distribution-id EB9MXBNYV9HVD --id I8YX3BAOO3P65D2A09GQLP2KD6
   ```
   Should show "Completed"

3. **Test API Directly:**
   ```bash
   curl -I https://teckstart.com/api/expenses
   ```
   Should return headers (may be 401 without auth, but should not be CORS error)

4. **Check Browser Console:**
   - Look for any 404 errors on /api/* paths
   - Verify requests are going to teckstart.com/api/* not API Gateway directly

### Rollback Plan

If needed, revert to direct API Gateway calls:

1. Update frontend files:
   ```javascript
   API_BASE_URL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod'
   ```

2. Deploy to S3 and invalidate cache

3. Remove CloudFront cache behavior (optional)

### Files Modified

- `frontend/app.js` - Updated API_BASE_URL
- `frontend/index.html` - Updated window.API_BASE_URL
- `frontend/settings.js` - Updated API_GATEWAY_URL
- `add-api-to-cloudfront.py` - Script to configure CloudFront

### Git Commit

- **Branch**: migration/teckstart-domain
- **Commit**: 4cea848
- **Message**: "fix: Proxy API requests through CloudFront to resolve Chrome PNA issue"

---

**Status**: ✅ Deployed and propagating (wait 5-10 minutes for full deployment)