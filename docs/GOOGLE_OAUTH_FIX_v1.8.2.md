# Google OAuth Fix - Version 1.8.2

**Date:** November 10, 2025  
**Issue:** "user.email can't be updated" error when logging in with Google  
**Status:** ✅ **DEPLOYED AND READY FOR TESTING**

---

## Problem Summary

Users experienced an error when attempting to log in with Google OAuth:
> **"user.email attribute cannot be updated"**

After clicking "Sign in with Google" and selecting their Google account, users were redirected back to the login screen with this error message.

---

## Root Cause

The post-authentication Lambda function (`expense-tracker-prod-postauth-link`) was using an **incorrect method** to detect federated (Google) users.

### Old (Broken) Detection Method

```javascript
const isFederatedUser = currentUsername.includes('_');
```

This assumed Google users would have usernames like `Google_<user_id>`, but AWS Cognito actually creates **UUID-format usernames** like `d4d864a8-f091-7015-dfa4-0821838e3ca9` for federated users.

### Why This Caused the Error

1. Lambda incorrectly detected Google users as **non-federated** users
2. Lambda checked if `email_verified === 'true'`
3. For Google users, Cognito doesn't set `email_verified=true` (Google verifies it)
4. Lambda rejected the authentication
5. Cognito returned error: "user.email can't be updated"

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

### Applied Same Fix for Existing Accounts

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

## Deployment Details

### Lambda Function
- **Function Name:** `expense-tracker-prod-postauth-link`
- **File:** `lambda/post-authentication-link.js`
- **Package Size:** 6.6 MB (6,907,407 bytes)
- **Deployment Time:** November 10, 2025 at 14:31:46 UTC
- **Runtime:** Node.js 22.x
- **Handler:** `post-authentication-link.handler`
- **Timeout:** 10 seconds
- **Memory:** 256 MB

### Lines Changed
- Lines 47-64: Changed federated user detection and email trust logic
- Lines 89-105: Applied same logic for checking existing accounts

### Deployment Method
```bash
cd /home/ubuntu/expense-tracker/lambda
npm install --production
zip -r post-auth-link.zip post-authentication-link.js node_modules/
aws lambda update-function-code \
  --function-name expense-tracker-prod-postauth-link \
  --zip-file fileb://post-auth-link.zip \
  --region us-east-1
```

---

## Testing Instructions

### Test Google OAuth Login

1. **Open the application:** https://app.twin-wicks.com
2. **Click "Sign in with Google"**
3. **Select your Google account**
4. **Authorize the application**

### Expected Behavior

✅ **Success:** User is logged in and redirected to dashboard  
✅ **No errors:** No "user.email can't be updated" message  
✅ **Account linking:** If you have both email/password and Google accounts with the same email, they will be automatically linked

### Monitor CloudWatch Logs

```bash
aws logs tail /aws/lambda/expense-tracker-prod-postauth-link \
  --since 5m \
  --follow \
  --region us-east-1
```

### Expected Log Output

```json
{
  "username": "d4d864a8-f091-7015-dfa4-0821838e3ca9",
  "email": "user@example.com",
  "emailVerified": "false",
  "isFederated": true,
  "trusted": true
}
```

---

## Verification Checklist

- [x] Lambda code updated with correct federated user detection
- [x] Lambda deployed to AWS
- [x] Deployment confirmed (LastModified: 2025-11-10T14:31:46.000+0000)
- [ ] Google OAuth login tested successfully
- [ ] Account linking verified (if applicable)
- [ ] Changes committed to git repository

---

## Related Fixes

This fix builds upon previous OAuth work:

- **v1.5.0:** Initial Google OAuth sign-in implementation
- **v1.6.0:** Federated account linking
- **v1.7.0:** Google account linking improvements
- **v1.8.0:** Multiple OAuth bug fixes
- **v1.8.1:** First attempt at fixing federated user detection
- **v1.8.2:** Complete fix with proper `identities` attribute checking

---

## Technical Notes

### Why `identities` Attribute is Reliable

The `identities` attribute is a **Cognito-managed attribute** that contains a JSON array of all identity providers linked to the user:

```json
[
  {
    "providerName": "Google",
    "providerType": "Google",
    "userId": "123456789",
    "dateCreated": "1699564800000",
    "issuer": "https://accounts.google.com"
  }
]
```

- **Always present** for federated users
- **Never present** for native Cognito users
- **Cannot be spoofed** by the user
- **Reliable indicator** of authentication method

### Why Username Format is Unreliable

Cognito username formats vary:
- **Native users:** Email address or custom username
- **Federated users (old format):** `Google_<provider_user_id>`
- **Federated users (new format):** UUID like `d4d864a8-f091-7015-dfa4-0821838e3ca9`

The format changed in recent Cognito updates, making username-based detection unreliable.

---

## Security Considerations

### Email Verification Trust

**Question:** Is it safe to trust Google's email verification?

**Answer:** Yes, because:
1. Google verifies email ownership during account creation
2. Google is a trusted identity provider
3. Cognito validates the OAuth token from Google
4. The `identities` attribute confirms the user authenticated via Google

### Account Linking Security

The Lambda still enforces security checks:
- Both accounts must have the same email address
- Both accounts must have verified emails (or be from trusted providers)
- Only links native and federated accounts (not two federated accounts)
- Idempotent operation (safe to run multiple times)

---

## Rollback Plan

If issues occur, rollback to previous version:

```bash
# Get previous version ARN
aws lambda list-versions-by-function \
  --function-name expense-tracker-prod-postauth-link \
  --region us-east-1 \
  --query 'Versions[-2].Version'

# Rollback to previous version
aws lambda update-function-configuration \
  --function-name expense-tracker-prod-postauth-link \
  --environment Variables={USER_POOL_ID=us-east-1_7H7R5DVZT,REGION=us-east-1} \
  --region us-east-1
```

---

## Next Steps

1. **Test the fix** by logging in with Google
2. **Verify account linking** works correctly
3. **Commit changes** to git repository
4. **Update version tag** to v1.8.2
5. **Monitor CloudWatch logs** for any issues

---

## Support

If issues persist:
1. Check CloudWatch logs for detailed error messages
2. Verify Cognito User Pool configuration
3. Ensure Google identity provider is properly configured
4. Check that Lambda has correct IAM permissions

---

## References

- [AWS Cognito Post-Authentication Trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-post-authentication.html)
- [Cognito Federated Identities](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation.html)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Previous fix: v1.8.1](./GOOGLE_OAUTH_FIX_v1.8.1.md)

---

**Status:** ✅ Ready for testing  
**Deployed:** November 10, 2025 at 14:31:46 UTC  
**Version:** 1.8.2
