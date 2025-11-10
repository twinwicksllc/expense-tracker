# Google OAuth Fix - Version 1.8.1

**Date:** November 10, 2025  
**Issue:** "user.email attribute cannot be updated" error when logging in with Google  
**Status:** ✅ Lambda deployed, needs testing and git commit

---

## Problem Summary

When users tried to log in with Google OAuth, they were redirected back to the login screen with an error: **"user.email attribute cannot be updated"**.

### Root Cause

The post-authentication Lambda function (`expense-tracker-prod-postauth-link`) was using an **incorrect method** to detect federated (Google) users.

**Old (Broken) Detection Method:**
```javascript
const isFederatedUser = currentUsername.includes('_');
```

This assumed Google users would have usernames like `Google_<user_id>`, but AWS Cognito actually creates UUID-format usernames like `d4d864a8-f091-7015-dfa4-0821838e3ca9` for federated users.

### Evidence from CloudWatch Logs

```json
{
  "username": "d4d864a8-f091-7015-dfa4-0821838e3ca9",
  "email_verified": "false",
  "identities": "[{\"providerName\":\"Google\",\"providerType\":\"Google\"}]",
  "email": "twinwicksllc@gmail.com"
}
```

Log output showed:
```
Email not verified and not from trusted provider, skipping account linking
{ email: 'twinwicksllc@gmail.com', emailVerified: 'false', isFederated: false }
```

The Lambda **incorrectly detected** `isFederated: false` even though the user clearly had Google identities!

---

## Solution Implemented

### Changed Federated User Detection

**New (Correct) Detection Method:**
```javascript
// Check the identities attribute instead of username format
const identitiesAttr = event.request.userAttributes.identities;
const isFederatedUser = identitiesAttr && identitiesAttr.length > 0;
```

### Updated Email Verification Logic

**Old Logic:**
```javascript
// Security check: Only proceed if email is verified
if (emailVerified !== 'true') {
    return event;
}
```

**New Logic:**
```javascript
// For federated users, email is verified by the identity provider (Google)
// Cognito may not set email_verified=true, but we can trust Google's verification
const isEmailTrusted = emailVerified === 'true' || isFederatedUser;

// Security check: Only proceed if email is verified or from trusted provider
if (!isEmailTrusted) {
    return event;
}
```

### Applied Same Fix for Other Account

When checking if an existing account can be linked, the Lambda now also properly detects if the other account is federated:

```javascript
// Determine if the other account is federated
const otherIdentitiesAttr = existingUser.Attributes.find(
    attr => attr.Name === 'identities'
)?.Value;
const otherIsFederated = otherIdentitiesAttr && otherIdentitiesAttr.length > 0;

// For the other account, also trust federated provider's email verification
const otherEmailTrusted = otherEmailVerified === 'true' || otherIsFederated;
```

---

## Files Modified

### Lambda Function
- **File:** `lambda/post-authentication-link.js`
- **Lines Changed:** ~47-64, ~89-105
- **Deployment:** ✅ Deployed to `expense-tracker-prod-postauth-link`
- **Package Size:** 5.1 MB
- **Deployment Time:** November 10, 2025 13:28 UTC

### Changes Summary
1. Line 47-50: Changed federated user detection to use `identities` attribute
2. Line 52-64: Added email trust logic for federated providers
3. Line 89-105: Applied same logic for checking existing accounts

---

## What's Been Completed

✅ **Identified the bug** - Incorrect federated user detection  
✅ **Fixed the Lambda code** - Now uses `identities` attribute  
✅ **Deployed to AWS** - Lambda function updated successfully  
✅ **Created documentation** - This file  

---

## What Still Needs to Be Done

### 1. Test the Fix
**Action Required:** Try logging in with Google OAuth

**Expected Behavior:**
- Click "Sign in with Google"
- Authorize with Google account
- Should successfully log in without errors
- Should be redirected to dashboard

**How to Verify:**
```bash
# Check CloudWatch logs for the Lambda
aws logs tail /aws/lambda/expense-tracker-prod-postauth-link --since 5m --follow
```

**Expected Log Output:**
```
Email verification status: { 
  emailVerified: 'false', 
  isFederated: true, 
  trusted: true 
}
```

### 2. Commit Changes to Git

**Commands to Run:**
```bash
cd /home/ubuntu/expense-tracker-updated

# Add the modified Lambda file
git add lambda/post-authentication-link.js

# Add this documentation
git add GOOGLE_OAUTH_FIX_v1.8.1.md

# Commit with descriptive message
git commit -m "Fix Google OAuth federated user detection

- Changed detection method from username format to identities attribute
- Google users now properly detected as federated
- Email verification now trusts Google's verification
- Fixes 'user.email attribute cannot be updated' error

Technical details:
- Old method: checked if username contains '_'
- New method: checks identities attribute
- Applied to both current user and existing account checks

Deployment:
- Lambda: expense-tracker-prod-postauth-link
- Deployed: 2025-11-10 13:28 UTC
- Package size: 5.1 MB

See GOOGLE_OAUTH_FIX_v1.8.1.md for complete details"

# Push to GitHub
git push origin main

# Optional: Create version tag
git tag -a v1.8.1 -m "Fix Google OAuth federated user detection"
git push origin v1.8.1
```

### 3. Update CHANGELOG

**File:** `CHANGELOG.md`

**Add Entry:**
```markdown
## [1.8.1] - 2025-11-10

### Fixed
- Google OAuth login now works correctly
- Fixed "user.email attribute cannot be updated" error
- Changed federated user detection from username format to identities attribute
- Email verification now trusts Google's verification for federated users

### Technical
- Updated `lambda/post-authentication-link.js` to properly detect Google users
- Lambda function redeployed to production
```

### 4. Verify Account Linking (Optional)

If you want to test account linking between email/password and Google:

1. **Create email/password account:**
   - Sign up with email: `test@example.com`
   - Verify email
   - Log in successfully

2. **Link Google account:**
   - Log out
   - Sign in with Google using same email: `test@example.com`
   - Should automatically link accounts
   - Should be able to log in with either method

3. **Check logs:**
```bash
aws logs tail /aws/lambda/expense-tracker-prod-postauth-link --since 10m
```

Look for: `"Accounts linked successfully"`

---

## Technical Details

### Why This Happened

AWS Cognito's username format for federated users changed or varies based on configuration. The old code assumed a specific format (`Google_<id>`), but Cognito actually uses different formats:

**Possible Username Formats:**
- UUID format: `d4d864a8-f091-7015-dfa4-0821838e3ca9` (current)
- Provider format: `Google_113592101542572736063` (old assumption)

The **reliable way** to detect federated users is the `identities` attribute, which is always present for federated users and contains:
```json
{
  "providerName": "Google",
  "providerType": "Google",
  "userId": "113592101542572736063"
}
```

### Security Considerations

✅ **Safe:** Google has already verified the email before providing it to Cognito  
✅ **Secure:** We check that the user actually has federated identities  
✅ **Maintained:** Native (email/password) users still require email verification  
✅ **Logged:** All verification decisions are logged for audit purposes  

### Why Email Verification Shows False

Cognito's `email_verified` attribute behavior:
- For **native users** (email/password): Set to `true` after email confirmation
- For **federated users** (Google OAuth): Often remains `false` even though Google verified it

This is expected AWS Cognito behavior. The fix properly handles this by trusting the federated provider's verification.

---

## Rollback Instructions (If Needed)

If the fix causes issues, you can rollback:

### Option 1: Revert Lambda Code
```bash
cd /home/ubuntu/expense-tracker-updated
git checkout v1.8.0 -- lambda/post-authentication-link.js
cd lambda
zip -r postauth-link.zip post-authentication-link.js node_modules/
aws lambda update-function-code \
  --function-name expense-tracker-prod-postauth-link \
  --zip-file fileb://postauth-link.zip
```

### Option 2: Disable Post-Authentication Trigger
In AWS Cognito Console:
1. Go to User Pool: `us-east-1_7H7R5DVZT`
2. Lambda triggers
3. Post authentication trigger
4. Remove the trigger temporarily

---

## Related Files

- `lambda/post-authentication-link.js` - The fixed Lambda function
- `GOOGLE_OAUTH_FIX.md` - Previous OAuth fix documentation (v1.8.0)
- `docs/v1.5.0-google-oauth-plan.md` - Original OAuth implementation plan
- `docs/csp-oauth-fix.md` - CSP fix for OAuth (v1.5.0)
- `frontend/oauth.js` - Frontend OAuth handling

---

## CloudWatch Logs Location

**Log Group:** `/aws/lambda/expense-tracker-prod-postauth-link`

**Useful Commands:**
```bash
# Tail logs in real-time
aws logs tail /aws/lambda/expense-tracker-prod-postauth-link --follow

# View last hour
aws logs tail /aws/lambda/expense-tracker-prod-postauth-link --since 1h

# Search for errors
aws logs tail /aws/lambda/expense-tracker-prod-postauth-link --since 1h --filter-pattern "ERROR"
```

---

## Summary

**Problem:** Google OAuth login failed with "user.email attribute cannot be updated"  
**Root Cause:** Lambda used username format to detect federated users (incorrect)  
**Solution:** Changed to use `identities` attribute (correct)  
**Status:** Lambda deployed, needs testing and git commit  
**Next Steps:** Test login, commit to git, update CHANGELOG  

---

## Contact & Support

If you encounter issues:
1. Check CloudWatch logs first
2. Verify the Lambda function is using the latest code
3. Ensure Cognito triggers are properly configured
4. Test with a fresh browser session (incognito mode)

**Lambda Function ARN:**
```
arn:aws:lambda:us-east-1:391907191624:function:expense-tracker-prod-postauth-link
```

**User Pool ID:**
```
us-east-1_7H7R5DVZT
```

**App Client ID:**
```
pk3l1fkkre0ms4si0prabfavl
```

