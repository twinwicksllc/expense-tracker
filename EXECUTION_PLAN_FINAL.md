# Final Execution Plan - All Issues Identified

## 🎯 Complete Issue List

### Files to Fix:
1. **lambda/auth-utils.mjs** - 2 old references (User Pool ID, Client ID)
2. **lambda/link-account.mjs** - 1 old reference (CORS domain)
3. **lambda/unlink-account.mjs** - 2 old references (User Pool ID, CORS domain)
4. **frontend/dashboard-enhanced.js** - 2 old references (Authorization header)
5. **CloudFront /api/* routing** - Returns HTML instead of JSON (CRITICAL BLOCKER)

### Files to Ignore:
- fix-oauth-option1.sh (old script, not used)
- frontend-backup-pre-migration/* (backup files)
- deployed_* (backup files)
- *.backup (backup files)

---

## ✅ Execution Steps

### STEP 1: Fix Lambda Source Files

#### 1.1: Fix auth-utils.mjs
```bash
cd /workspace/expense-tracker/lambda

# Update User Pool ID
sed -i "s|us-east-1_7H7R5DVZT|us-east-1_iSsgMCrkM|g" auth-utils.mjs

# Update Client ID
sed -i "s|pk3l1fkkre0ms4si0prabfavl|6jb82h9lrvh29505t1ihavfte9|g" auth-utils.mjs

# Verify
grep -E "us-east-1_iSsgMCrkM|6jb82h9lrvh29505t1ihavfte9" auth-utils.mjs
```

#### 1.2: Fix link-account.mjs
```bash
# Update CORS domain
sed -i "s|app.twin-wicks.com|teckstart.com|g" link-account.mjs

# Verify
grep "teckstart.com" link-account.mjs
```

#### 1.3: Fix unlink-account.mjs
```bash
# Update User Pool ID
sed -i "s|us-east-1_7H7R5DVZT|us-east-1_iSsgMCrkM|g" unlink-account.mjs

# Update CORS domain
sed -i "s|app.twin-wicks.com|teckstart.com|g" unlink-account.mjs

# Verify
grep -E "us-east-1_iSsgMCrkM|teckstart.com" unlink-account.mjs
```

---

### STEP 2: Fix Frontend File

#### 2.1: Fix dashboard-enhanced.js
```bash
cd /workspace/expense-tracker/frontend

# Update Authorization to X-Auth-Token
sed -i "s|'Authorization':|'X-Auth-Token':|g" dashboard-enhanced.js

# Verify
grep "X-Auth-Token" dashboard-enhanced.js
```

---

### STEP 3: Deploy Lambda Functions

#### 3.1: Deploy link-account
```bash
cd /workspace/expense-tracker/lambda

# Find the deployed function directory
FUNC_DIR=$(find . -type d -name "*link-account*" | grep -v node_modules | head -1)

if [ -n "$FUNC_DIR" ]; then
    cd "$FUNC_DIR"
    
    # Copy updated source
    cp ../link-account.mjs .
    
    # Install dependencies if needed
    if [ -f "package.json" ]; then
        npm install --production --silent
    fi
    
    # Create deployment package
    zip -r link-account-fixed.zip . -q
    
    # Deploy
    aws lambda update-function-code \
        --function-name expense-tracker-prod-link-account \
        --zip-file fileb://link-account-fixed.zip
    
    echo "✓ Deployed link-account"
else
    echo "⚠ link-account function directory not found"
fi
```

#### 3.2: Deploy unlinkAccount
```bash
cd /workspace/expense-tracker/lambda

# Find the deployed function directory
FUNC_DIR=$(find . -type d -name "*unlinkAccount*" | grep -v node_modules | head -1)

if [ -n "$FUNC_DIR" ]; then
    cd "$FUNC_DIR"
    
    # Copy updated source
    cp ../unlink-account.mjs .
    
    # Copy auth-utils if needed
    if [ -f "../auth-utils.mjs" ]; then
        cp ../auth-utils.mjs .
    fi
    
    # Install dependencies if needed
    if [ -f "package.json" ]; then
        npm install --production --silent
    fi
    
    # Create deployment package
    zip -r unlink-account-fixed.zip . -q
    
    # Deploy
    aws lambda update-function-code \
        --function-name expense-tracker-prod-unlinkAccount \
        --zip-file fileb://unlink-account-fixed.zip
    
    echo "✓ Deployed unlinkAccount"
else
    echo "⚠ unlinkAccount function directory not found"
fi
```

---

### STEP 4: Deploy Frontend

#### 4.1: Deploy dashboard-enhanced.js
```bash
cd /workspace/expense-tracker/frontend

# Deploy to S3
aws s3 cp dashboard-enhanced.js s3://teckstart.com/ \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "application/javascript"

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
    --distribution-id EB9MXBNYV9HVD \
    --paths "/dashboard-enhanced.js"

echo "✓ Deployed dashboard-enhanced.js"
```

---

### STEP 5: Fix CloudFront /api/* Routing (CRITICAL)

#### Option A: Use Different Path (QUICKEST)
```bash
# 1. Update CloudFront behavior to use /backend/* instead of /api/*
# 2. Update frontend to use /backend instead of /api
# 3. Test

# Update frontend
cd /workspace/expense-tracker/frontend
sed -i "s|window.API_BASE_URL = '/api'|window.API_BASE_URL = '/backend'|g" index.html
sed -i "s|API_BASE_URL: '/api'|API_BASE_URL: '/backend'|g" app.js
sed -i "s|API_GATEWAY_URL = '/api'|API_GATEWAY_URL = '/backend'|g" settings.js

# Deploy frontend
aws s3 cp index.html s3://teckstart.com/ --cache-control "no-cache"
aws s3 cp app.js s3://teckstart.com/ --cache-control "no-cache"
aws s3 cp settings.js s3://teckstart.com/ --cache-control "no-cache"

# Update CloudFront (Python script)
python3 << 'EOF'
import json, subprocess

def run(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

config = json.loads(run("aws cloudfront get-distribution-config --id EB9MXBNYV9HVD"))
dist_config = config['DistributionConfig']
etag = config['ETag']

# Update cache behavior path
for behavior in dist_config['CacheBehaviors']['Items']:
    if behavior['PathPattern'] == '/api/*':
        behavior['PathPattern'] = '/backend/*'
        print("✓ Updated path pattern to /backend/*")
        break

# Save and update
with open('/tmp/cf-update.json', 'w') as f:
    json.dump(dist_config, f)

run(f'aws cloudfront update-distribution --id EB9MXBNYV9HVD --distribution-config file:///tmp/cf-update.json --if-match {etag}')
print("✓ CloudFront updated")
EOF

# Invalidate cache
aws cloudfront create-invalidation --distribution-id EB9MXBNYV9HVD --paths "/*"
```

#### Option B: Direct API Gateway (ALTERNATIVE)
```bash
# Update frontend to call API Gateway directly
cd /workspace/expense-tracker/frontend

sed -i "s|window.API_BASE_URL = '/api'|window.API_BASE_URL = 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod'|g" index.html
sed -i "s|API_BASE_URL: '/api'|API_BASE_URL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod'|g" app.js
sed -i "s|API_GATEWAY_URL = '/api'|API_GATEWAY_URL = 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod'|g" settings.js

# Deploy
aws s3 cp index.html s3://teckstart.com/ --cache-control "no-cache"
aws s3 cp app.js s3://teckstart.com/ --cache-control "no-cache"
aws s3 cp settings.js s3://teckstart.com/ --cache-control "no-cache"

# Invalidate
aws cloudfront create-invalidation --distribution-id EB9MXBNYV9HVD --paths "/*"
```

---

### STEP 6: Verification

#### 6.1: Verify No Old References
```bash
cd /workspace/expense-tracker

echo "=== Checking for old User Pool ==="
grep -r "us-east-1_7H7R5DVZT" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration 2>/dev/null | grep -v ".backup" | grep -v "deployed_" | grep -v "fix-oauth-option1.sh"

echo "=== Checking for old Client ID ==="
grep -r "pk3l1fkkre0ms4si0prabfavl" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration 2>/dev/null | grep -v ".backup" | grep -v "deployed_"

echo "=== Checking for old domain ==="
grep -r "app.twin-wicks.com" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" --exclude-dir=frontend-backup-pre-migration 2>/dev/null | grep -v ".backup" | grep -v "deployed_"

echo "=== Checking for Authorization header ==="
grep -r "'Authorization'" frontend/ --include="*.js" 2>/dev/null | grep -v "X-Auth-Token" | grep -v node_modules
```

**Expected:** All should return nothing (or only backup files)

#### 6.2: Test API Routing
```bash
echo "=== Testing API Gateway directly ==="
curl -s https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/expenses | head -5

echo "=== Testing through CloudFront ==="
curl -s https://teckstart.com/backend/expenses | head -5
# OR
curl -s https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/expenses | head -5

# Should return JSON, not HTML
```

#### 6.3: Manual Testing Checklist
- [ ] Clear browser cache
- [ ] Navigate to https://teckstart.com
- [ ] Login with Google OAuth
- [ ] Dashboard loads with data
- [ ] Expenses tab works
- [ ] Projects tab works
- [ ] Can add expense
- [ ] Can edit expense
- [ ] Can delete expense
- [ ] Can link account (if applicable)
- [ ] Can unlink account (if applicable)
- [ ] No console errors

---

### STEP 7: Commit Changes

```bash
cd /workspace/expense-tracker

# Add all changes
git add -A

# Commit
git commit -m "fix: Update all old User Pool, Client ID, and domain references

- Updated auth-utils.mjs fallback values to new User Pool and Client ID
- Updated link-account.mjs CORS to use teckstart.com
- Updated unlink-account.mjs User Pool and CORS
- Updated dashboard-enhanced.js to use X-Auth-Token header
- Fixed CloudFront routing for API requests

Fixes:
- Account linking now works from teckstart.com
- Account unlinking now works from teckstart.com  
- Dashboard API calls use correct auth header
- All fallback values point to new infrastructure"

# Push
git push https://x-access-token:$GITHUB_TOKEN@github.com/twinwicksllc/expense-tracker.git migration/teckstart-domain
```

---

## 📊 Summary

### Files to Update:
1. ✅ lambda/auth-utils.mjs (2 changes)
2. ✅ lambda/link-account.mjs (1 change)
3. ✅ lambda/unlink-account.mjs (2 changes)
4. ✅ frontend/dashboard-enhanced.js (2 changes)
5. ✅ CloudFront configuration (1 change)
6. ✅ frontend/index.html, app.js, settings.js (API path change)

### Lambda Functions to Deploy:
1. ✅ expense-tracker-prod-link-account
2. ✅ expense-tracker-prod-unlinkAccount

### Frontend Files to Deploy:
1. ✅ dashboard-enhanced.js
2. ✅ index.html
3. ✅ app.js
4. ✅ settings.js

### Infrastructure Changes:
1. ✅ CloudFront cache behavior path (or use direct API Gateway)

---

## 🎯 Recommended Approach

**I recommend Option A (Change to /backend/*) because:**
1. Quickest to implement
2. Avoids S3 website endpoint conflict
3. Keeps CloudFront proxy benefits
4. Easy to test and verify

**Alternative: Option B (Direct API Gateway) if:**
1. CloudFront proxy not needed
2. Want simpler architecture
3. CORS already configured correctly

---

## ⏱️ Estimated Time
- Step 1-2: 5 minutes (fix files)
- Step 3-4: 10 minutes (deploy)
- Step 5: 15 minutes (CloudFront fix)
- Step 6: 10 minutes (verification)
- Step 7: 5 minutes (commit)

**Total: ~45 minutes**

---

## ✅ Ready to Execute

This plan will fix ALL known issues:
1. ✅ Old User Pool references
2. ✅ Old Client ID references
3. ✅ Old domain in CORS
4. ✅ Authorization header usage
5. ✅ CloudFront /api/* routing

Shall I proceed with execution?