# Complete Fix Plan - All Known Issues

## 🎯 Objective
Fix ALL known issues with old references and configuration drift, then verify the application works end-to-end.

---

## 📋 Phase 1: Identify All Issues (DISCOVERY)

### Step 1.1: Search for Old User Pool ID
```bash
grep -r "us-east-1_7H7R5DVZT" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration
```

**Expected findings:**
- lambda/auth-utils.mjs (fallback value)
- lambda/unlink-account.mjs (fallback value)
- fix-oauth-option1.sh (old script - safe to ignore)

### Step 1.2: Search for Old Client ID
```bash
grep -r "pk3l1fkkre0ms4si0prabfavl" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration
```

**Expected findings:**
- lambda/auth-utils.mjs (fallback value)

### Step 1.3: Search for Old Domain
```bash
grep -r "app.twin-wicks.com" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration --exclude-dir=deployed_*
```

**Expected findings:**
- lambda/link-account.mjs (CORS header)
- lambda/unlink-account.mjs (CORS header)
- Possibly other Lambda functions

### Step 1.4: Search for Authorization Header
```bash
grep -r "'Authorization'" frontend/ --include="*.js" | grep -v "X-Auth-Token"
grep -r '"Authorization"' frontend/ --include="*.js" | grep -v "X-Auth-Token"
```

**Expected findings:**
- Should be none (all should be X-Auth-Token)

---

## 📋 Phase 2: Fix Lambda Functions (CRITICAL)

### Step 2.1: Fix link-account.mjs
**File:** `lambda/link-account.mjs`

**Changes needed:**
1. Update CORS header from `app.twin-wicks.com` to `teckstart.com`
2. Check for any other old references

**Commands:**
```bash
# Update CORS header
sed -i "s|app.twin-wicks.com|teckstart.com|g" lambda/link-account.mjs

# Verify changes
grep "teckstart.com" lambda/link-account.mjs
```

### Step 2.2: Fix unlink-account.mjs
**File:** `lambda/unlink-account.mjs`

**Changes needed:**
1. Update CORS header from `app.twin-wicks.com` to `teckstart.com`
2. Update fallback User Pool ID to new pool
3. Check for any other old references

**Commands:**
```bash
# Update CORS header
sed -i "s|app.twin-wicks.com|teckstart.com|g" lambda/unlink-account.mjs

# Update fallback User Pool ID
sed -i "s|us-east-1_7H7R5DVZT|us-east-1_iSsgMCrkM|g" lambda/unlink-account.mjs

# Verify changes
grep "teckstart.com" lambda/unlink-account.mjs
grep "us-east-1_iSsgMCrkM" lambda/unlink-account.mjs
```

### Step 2.3: Fix auth-utils.mjs
**File:** `lambda/auth-utils.mjs`

**Changes needed:**
1. Update fallback User Pool ID to new pool
2. Update fallback Client ID to new client

**Commands:**
```bash
# Update fallback User Pool ID
sed -i "s|us-east-1_7H7R5DVZT|us-east-1_iSsgMCrkM|g" lambda/auth-utils.mjs

# Update fallback Client ID
sed -i "s|pk3l1fkkre0ms4si0prabfavl|6jb82h9lrvh29505t1ihavfte9|g" lambda/auth-utils.mjs

# Verify changes
grep "us-east-1_iSsgMCrkM" lambda/auth-utils.mjs
grep "6jb82h9lrvh29505t1ihavfte9" lambda/auth-utils.mjs
```

### Step 2.4: Check Other Lambda Functions
**Files to check:**
- lambda/presignup-link.mjs
- lambda/postauth-link.mjs
- lambda/signup.mjs
- lambda/login.mjs
- lambda/confirmSignup.mjs
- lambda/getUser.mjs
- lambda/getUploadUrl.mjs
- lambda/parseReceipt.mjs
- lambda/aws-credentials.mjs
- lambda/aws-cost-import.js

**For each file:**
```bash
# Check for old references
grep -E "us-east-1_7H7R5DVZT|pk3l1fkkre0ms4si0prabfavl|app.twin-wicks.com" lambda/[filename]

# If found, update them
sed -i "s|us-east-1_7H7R5DVZT|us-east-1_iSsgMCrkM|g" lambda/[filename]
sed -i "s|pk3l1fkkre0ms4si0prabfavl|6jb82h9lrvh29505t1ihavfte9|g" lambda/[filename]
sed -i "s|app.twin-wicks.com|teckstart.com|g" lambda/[filename]
```

---

## 📋 Phase 3: Deploy Lambda Functions

### Step 3.1: Identify Which Functions Need Deployment
**Functions that need deployment:**
1. expense-tracker-prod-link-account (if link-account.mjs changed)
2. expense-tracker-prod-unlinkAccount (if unlink-account.mjs changed)
3. Any other functions with changes

### Step 3.2: Package and Deploy Each Function
**For each function:**

```bash
# Navigate to function directory
cd lambda/expense-tracker-prod-[function-name]

# Copy updated source file if needed
cp ../[source-file].mjs .

# Ensure dependencies are installed
if [ -f "package.json" ]; then
    npm install --production
fi

# Create deployment package
zip -r function.zip . -q

# Deploy to AWS
aws lambda update-function-code \
    --function-name expense-tracker-prod-[function-name] \
    --zip-file fileb://function.zip

# Wait for update to complete
aws lambda wait function-updated \
    --function-name expense-tracker-prod-[function-name]

# Verify deployment
aws lambda get-function-configuration \
    --function-name expense-tracker-prod-[function-name] \
    --query 'LastModified' --output text
```

### Step 3.3: Verify Environment Variables
**For each deployed function:**

```bash
# Check environment variables
aws lambda get-function-configuration \
    --function-name expense-tracker-prod-[function-name] \
    --query 'Environment.Variables' --output json

# Verify:
# - USER_POOL_ID = us-east-1_iSsgMCrkM
# - CLIENT_ID = 6jb82h9lrvh29505t1ihavfte9
```

---

## 📋 Phase 4: Fix CloudFront /api/* Routing (CRITICAL BLOCKER)

### Current Problem
CloudFront returns `index.html` for `/api/*` requests instead of proxying to API Gateway.

### Root Cause
S3 website endpoint behavior interferes with CloudFront cache behaviors.

### Solution Options

#### Option A: Use CloudFront Functions (RECOMMENDED)
Create a CloudFront Function to force routing for `/api/*` paths.

**Steps:**
1. Create CloudFront Function
2. Attach to viewer request event
3. Test routing

#### Option B: Change API Path
Use a different path that S3 definitely doesn't have.

**Steps:**
1. Change CloudFront behavior from `/api/*` to `/backend/*`
2. Update frontend to use `/backend` instead of `/api`
3. Test routing

#### Option C: Use REST API Endpoint for S3
Change S3 origin from website endpoint to REST API endpoint.

**Steps:**
1. Update CloudFront origin to use `teckstart.com.s3.us-east-1.amazonaws.com`
2. Ensure bucket policy allows CloudFront access
3. Test routing

#### Option D: Direct API Gateway Access
Update frontend to call API Gateway directly.

**Steps:**
1. Update frontend to use `https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod`
2. Ensure API Gateway CORS is configured for teckstart.com
3. Test all endpoints

### Recommended: Option A (CloudFront Functions)

**CloudFront Function Code:**
```javascript
function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // If request is for /api/*, route to API Gateway origin
    if (uri.startsWith('/api/')) {
        // CloudFront will use the cache behavior for /api/*
        return request;
    }
    
    // For all other requests, route to S3 origin
    return request;
}
```

**Deployment:**
```bash
# Create function
aws cloudfront create-function \
    --name expense-tracker-api-router \
    --function-config Comment="Route /api/* to API Gateway",Runtime=cloudfront-js-1.0 \
    --function-code fileb://cloudfront-function.js

# Publish function
aws cloudfront publish-function \
    --name expense-tracker-api-router \
    --if-match [ETAG]

# Associate with distribution
# (Update distribution config to add function association)
```

---

## 📋 Phase 5: Verification & Testing

### Step 5.1: Verify All Changes
```bash
# Check no old User Pool references
grep -r "us-east-1_7H7R5DVZT" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration

# Check no old Client ID references
grep -r "pk3l1fkkre0ms4si0prabfavl" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration

# Check no old domain references (except backups)
grep -r "app.twin-wicks.com" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration --exclude-dir=deployed_*

# Check all using X-Auth-Token
grep -r "'Authorization'" frontend/ --include="*.js" | grep -v "X-Auth-Token"
```

### Step 5.2: Test API Routing
```bash
# Test API Gateway directly
curl -s https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/expenses | head -5

# Test through CloudFront
curl -s https://teckstart.com/api/expenses | head -5

# Should return JSON, not HTML
```

### Step 5.3: Test Authentication Flow
**Manual testing required:**
1. Clear browser cache
2. Navigate to https://teckstart.com
3. Test Google OAuth login
4. Test email/password login
5. Test account linking
6. Test account unlinking

### Step 5.4: Test Core Features
**Manual testing required:**
1. Dashboard loads
2. Expenses list loads
3. Projects list loads
4. Add expense
5. Edit expense
6. Delete expense
7. Add project
8. Upload receipt

### Step 5.5: Check Lambda Logs
```bash
# Check for errors in recent logs
for func in $(aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `expense-tracker-prod`)].FunctionName' --output text); do
    echo "=== $func ==="
    aws logs tail "/aws/lambda/$func" --since 1h --format short | grep ERROR | head -5
done
```

---

## 📋 Phase 6: Documentation & Cleanup

### Step 6.1: Update Documentation
- Update README with new domain
- Update API documentation
- Update deployment guides

### Step 6.2: Clean Up Old Files
```bash
# Delete old script
rm fix-oauth-option1.sh

# Archive backup files
mkdir -p archives
mv frontend-backup-pre-migration archives/
mv deployed_* archives/
mv lambda/*.backup archives/
```

### Step 6.3: Create Deployment Record
Document what was changed, when, and why.

---

## 📊 Summary of All Fixes

### Lambda Functions to Update:
1. ✅ link-account.mjs - Update CORS domain
2. ✅ unlink-account.mjs - Update CORS domain + fallback User Pool
3. ✅ auth-utils.mjs - Update fallback User Pool + Client ID
4. ⚠️ Check 10+ other Lambda functions for old references

### Infrastructure to Fix:
1. ✅ CloudFront /api/* routing (CRITICAL BLOCKER)

### Verification Steps:
1. ✅ Search for all old references
2. ✅ Test API routing
3. ✅ Test authentication
4. ✅ Test core features
5. ✅ Check Lambda logs

---

## 🎯 Execution Order

### Priority 1 (CRITICAL - Do First):
1. Fix CloudFront /api/* routing
2. Test API routing works
3. Fix link-account.mjs CORS
4. Fix unlink-account.mjs CORS
5. Deploy these two functions
6. Test account linking/unlinking

### Priority 2 (HIGH - Do Next):
1. Fix auth-utils.mjs fallbacks
2. Fix unlink-account.mjs fallback
3. Check all other Lambda functions
4. Deploy any with changes
5. Test all features

### Priority 3 (MEDIUM - Do After):
1. Verify no old references remain
2. Test comprehensive feature list
3. Check Lambda logs for errors
4. Update documentation
5. Clean up old files

---

## ✅ Success Criteria

### Must Have (Blocking):
- [ ] CloudFront /api/* routes to API Gateway (not S3)
- [ ] API returns JSON (not HTML)
- [ ] No old User Pool references in active code
- [ ] No old domain in CORS headers
- [ ] Account linking works
- [ ] Account unlinking works

### Should Have (Important):
- [ ] All Lambda functions checked for old references
- [ ] All Lambda functions have correct fallback values
- [ ] All features tested and working
- [ ] No errors in Lambda logs
- [ ] Documentation updated

### Nice to Have (Optional):
- [ ] Old files cleaned up
- [ ] Deployment record created
- [ ] Monitoring set up
- [ ] Alerts configured

---

## 🚨 Rollback Plan

If something breaks:

### Quick Rollback:
1. Revert CloudFront changes
2. Redeploy old Lambda functions from backup
3. Update frontend to use old API Gateway URL
4. Point DNS back to old domain

### Full Rollback:
1. Restore from `frontend-backup-pre-migration`
2. Restore Lambda functions from archives
3. Revert CloudFront to old configuration
4. Update DNS to point to old domain

---

## 📝 Estimated Time

- Phase 1 (Discovery): 15 minutes
- Phase 2 (Fix Lambda): 30 minutes
- Phase 3 (Deploy Lambda): 30 minutes
- Phase 4 (Fix CloudFront): 45 minutes
- Phase 5 (Testing): 60 minutes
- Phase 6 (Documentation): 30 minutes

**Total: ~3.5 hours**

---

## 🎬 Ready to Execute?

This plan will:
1. ✅ Fix all known old references
2. ✅ Fix CloudFront routing (critical blocker)
3. ✅ Deploy all changes
4. ✅ Test everything
5. ✅ Document changes

Shall I proceed with execution?