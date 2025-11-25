# Critical Fixes Needed - Old References Found

## 🔴 CRITICAL: Old References Still in Code

I found several places where old User Pool IDs and domains are still referenced. These need to be fixed immediately.

---

## Issue 1: Hardcoded Fallback Values in Lambda Functions

### Files Affected:
1. `lambda/auth-utils.mjs` (line 10)
2. `lambda/unlink-account.mjs` (line 14)

### Current Code:
```javascript
const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_7H7R5DVZT';  // ❌ OLD POOL
const CLIENT_ID = process.env.CLIENT_ID || 'pk3l1fkkre0ms4si0prabfavl';    // ❌ OLD CLIENT
```

### Problem:
If environment variables are not set, these functions will fall back to the **old User Pool v1** instead of failing safely.

### Risk Level: 🟡 MEDIUM
- Environment variables ARE currently set correctly
- But if they get cleared or reset, functions will silently use old pool
- This could cause authentication failures that are hard to debug

### Fix:
```javascript
const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_iSsgMCrkM';  // ✅ NEW POOL
const CLIENT_ID = process.env.CLIENT_ID || '6jb82h9lrvh29505t1ihavfte9';    // ✅ NEW CLIENT
```

**Or better yet, fail if not set:**
```javascript
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

if (!USER_POOL_ID || !CLIENT_ID) {
    throw new Error('USER_POOL_ID and CLIENT_ID environment variables must be set');
}
```

---

## Issue 2: Old Domain in CORS Headers

### Files Affected:
1. `lambda/link-account.mjs`
2. `lambda/unlink-account.mjs`

### Current Code:
```javascript
'Access-Control-Allow-Origin': 'https://app.twin-wicks.com',  // ❌ OLD DOMAIN
```

### Problem:
These Lambda functions will reject requests from `teckstart.com` because CORS only allows the old domain.

### Risk Level: 🔴 HIGH
- Account linking feature will NOT work from teckstart.com
- Users won't be able to link Google accounts with email/password accounts
- Users won't be able to unlink accounts

### Fix:
```javascript
'Access-Control-Allow-Origin': 'https://teckstart.com',  // ✅ NEW DOMAIN
```

**Or support both during transition:**
```javascript
'Access-Control-Allow-Origin': '*',  // ✅ ALLOW ALL (or check origin dynamically)
```

---

## Issue 3: Old Script File (Safe to Ignore)

### File: `fix-oauth-option1.sh`
```bash
USER_POOL_ID="us-east-1_7H7R5DVZT"  # ❌ OLD POOL
```

### Problem:
This is an old script that's no longer used.

### Risk Level: 🟢 LOW
- Not actively used
- Just a leftover file

### Fix:
Delete the file or update it for reference.

---

## Issue 4: Backup Files (Safe to Ignore)

### Files:
- `frontend-backup-pre-migration/app.js`
- `lambda/dashboard.js.backup`
- `deployed_app.js`

### Problem:
These are backup files with old configurations.

### Risk Level: 🟢 LOW
- Not actively used
- Just backups

### Fix:
Keep for rollback purposes, but document that they're backups.

---

## Summary of Fixes Needed

### 🔴 HIGH PRIORITY (Fix Immediately)

1. **Update CORS in link-account.mjs**
   ```javascript
   // Line ~50-60 (in response headers)
   'Access-Control-Allow-Origin': 'https://teckstart.com',
   ```

2. **Update CORS in unlink-account.mjs**
   ```javascript
   // Line ~50-60 (in response headers)
   'Access-Control-Allow-Origin': 'https://teckstart.com',
   ```

### 🟡 MEDIUM PRIORITY (Fix Soon)

3. **Update fallback in auth-utils.mjs**
   ```javascript
   // Line 10-11
   const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_iSsgMCrkM';
   const CLIENT_ID = process.env.CLIENT_ID || '6jb82h9lrvh29505t1ihavfte9';
   ```

4. **Update fallback in unlink-account.mjs**
   ```javascript
   // Line 14
   const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_iSsgMCrkM';
   ```

### 🟢 LOW PRIORITY (Optional)

5. **Delete or update fix-oauth-option1.sh**
6. **Document backup files**

---

## Testing After Fixes

### Test Account Linking:
1. Create account with email/password
2. Login with Google OAuth
3. Try to link accounts
4. Should work without CORS errors

### Test Account Unlinking:
1. Login with linked account
2. Go to settings
3. Try to unlink account
4. Should work without CORS errors

---

## Deployment Steps

### 1. Update Lambda Code
```bash
# Update auth-utils.mjs
sed -i "s/us-east-1_7H7R5DVZT/us-east-1_iSsgMCrkM/g" lambda/auth-utils.mjs
sed -i "s/pk3l1fkkre0ms4si0prabfavl/6jb82h9lrvh29505t1ihavfte9/g" lambda/auth-utils.mjs

# Update unlink-account.mjs
sed -i "s/us-east-1_7H7R5DVZT/us-east-1_iSsgMCrkM/g" lambda/unlink-account.mjs
sed -i "s/app.twin-wicks.com/teckstart.com/g" lambda/unlink-account.mjs

# Update link-account.mjs
sed -i "s/app.twin-wicks.com/teckstart.com/g" lambda/link-account.mjs
```

### 2. Deploy Lambda Functions
```bash
# Package and deploy link-account
cd lambda/expense-tracker-prod-link-account
zip -r link-account.zip . -q
aws lambda update-function-code --function-name expense-tracker-prod-link-account --zip-file fileb://link-account.zip

# Package and deploy unlinkAccount
cd ../expense-tracker-prod-unlinkAccount
zip -r unlink-account.zip . -q
aws lambda update-function-code --function-name expense-tracker-prod-unlinkAccount --zip-file fileb://unlink-account.zip
```

### 3. Test
- Test account linking
- Test account unlinking
- Verify no CORS errors

---

## Additional Findings

### Lambda Functions Not Yet Tested:
These functions might have similar issues:

1. **expense-tracker-prod-presignup-link** - Might have old domain in CORS
2. **expense-tracker-prod-postauth-link** - Might have old domain in CORS
3. **expense-tracker-prod-signup** - Might have old domain in CORS
4. **expense-tracker-prod-login** - Might have old domain in CORS
5. **expense-tracker-prod-confirmSignup** - Might have old domain in CORS
6. **expense-tracker-prod-getUser** - Might have old domain in CORS

**Recommendation:** Check each of these files for:
- Old User Pool ID: `us-east-1_7H7R5DVZT`
- Old Client ID: `pk3l1fkkre0ms4si0prabfavl`
- Old domain: `app.twin-wicks.com`

---

## Prevention for Future

### 1. Use Environment Variables
Always use environment variables, never hardcode:
```javascript
const USER_POOL_ID = process.env.USER_POOL_ID;
if (!USER_POOL_ID) throw new Error('USER_POOL_ID not set');
```

### 2. Use Wildcard CORS During Development
```javascript
'Access-Control-Allow-Origin': '*',  // Or check origin dynamically
```

### 3. Create Configuration File
Create a single `config.js` that all functions import:
```javascript
export const CONFIG = {
    USER_POOL_ID: process.env.USER_POOL_ID || 'us-east-1_iSsgMCrkM',
    CLIENT_ID: process.env.CLIENT_ID || '6jb82h9lrvh29505t1ihavfte9',
    DOMAIN: process.env.DOMAIN || 'https://teckstart.com'
};
```

### 4. Automated Testing
Create tests that verify:
- No old User Pool IDs in code
- No old domains in code
- Environment variables are set
- CORS headers are correct

---

## Status

- [x] Issues identified
- [ ] Fixes applied
- [ ] Lambda functions deployed
- [ ] Testing completed
- [ ] Documentation updated

---

**Next Steps:**
1. Apply the fixes to link-account.mjs and unlink-account.mjs
2. Deploy the updated Lambda functions
3. Test account linking/unlinking
4. Check other Lambda functions for similar issues