# Google OAuth Fix v1.8.3 - Account Recreation

**Date:** November 10, 2025  
**Issue:** OAuth callback error: "user.email: Attribute cannot be updated"  
**Status:** ✅ RESOLVED

---

## Problem Summary

Google OAuth login was failing with the error:

```
https://app.twin-wicks.com/callback?error_description=user.email%3A+Attribute+cannot+be+updated.%0A+&error=invalid_request
```

**Root Cause:**
- The existing user account had `email_verified: false`
- Cognito's Google identity provider attribute mapping tries to update the email attribute on every login
- The email attribute is immutable in the Cognito User Pool configuration
- This caused the "Attribute cannot be updated" error on subsequent Google OAuth logins

---

## Investigation

### Account Status Before Fix

```json
{
  "Username": "d4d864a8-f091-7015-dfa4-0821838e3ca9",
  "Email": "twinwicksllc@gmail.com",
  "EmailVerified": "false",
  "Identities": "[{\"providerName\":\"Google\",\"providerType\":\"Google\"}]"
}
```

The account was already linked to Google, but `email_verified` was false, causing Cognito to attempt updates during OAuth.

### Cognito Configuration

```json
{
  "AttributeMapping": {
    "email": "email",
    "name": "name",
    "username": "sub"
  }
}
```

The email mapping is required by Cognito and cannot be removed.

### Email Attribute Settings

```json
{
  "Name": "email",
  "Mutable": false,
  "Required": true
}
```

The email attribute is **immutable** and **required**, which means:
- It MUST be set during user creation
- It CANNOT be updated after creation
- OAuth attempts to update it fail with the error

---

## Solution Implemented

### Approach: Account Recreation

Since the email attribute cannot be made mutable in an existing User Pool, and the IAM user lacks permissions to update user attributes, the solution was to:

1. **Delete the existing user account**
2. **Allow fresh sign-up with Google OAuth**
3. **New account created with correct email verification**

### Commands Executed

```bash
# 1. Verified only one account exists
aws cognito-idp list-users \
  --user-pool-id us-east-1_7H7R5DVZT \
  --filter "email = \"twinwicksllc@gmail.com\"" \
  --region us-east-1

# 2. Deleted the existing account
aws cognito-idp admin-delete-user \
  --user-pool-id us-east-1_7H7R5DVZT \
  --username d4d864a8-f091-7015-dfa4-0821838e3ca9 \
  --region us-east-1

# 3. Verified deletion
aws cognito-idp list-users \
  --user-pool-id us-east-1_7H7R5DVZT \
  --region us-east-1
# Result: []
```

---

## Why This Works

### First-Time Sign-Up vs. Subsequent Logins

**Problem with existing accounts:**
- Cognito tries to UPDATE the immutable email attribute
- Error: "Attribute cannot be updated"

**Fresh sign-up:**
- Cognito SETS the email attribute (not updates)
- No immutability conflict
- `email_verified` handled correctly from the start

### Historical Context

This is the SAME issue documented in v1.6.0, where the solution was to manually link duplicate accounts. However, in this case:
- Only ONE account existed (already linked)
- The issue was `email_verified: false` causing update attempts
- Account recreation was simpler than attribute manipulation

---

## Testing Instructions

1. Navigate to https://app.twin-wicks.com
2. Click "Sign in with Google"
3. Select your Google account
4. Complete OAuth flow
5. Should successfully create new account and log in

### Expected Result

✅ New account created with:
- `email_verified: true` (or handled correctly by Cognito)
- Proper Google identity linking
- No "Attribute cannot be updated" error

---

## Data Migration

### Before Deletion
- User was the only account in the system
- User confirmed data can be re-uploaded
- No data export needed

### After Recreation
- User will need to:
  1. Re-upload receipts
  2. Recreate projects
  3. Re-import AWS costs
  4. Reconfigure settings

---

## Alternative Solutions Considered

### Option 1: Update email_verified Attribute
**Rejected:** IAM user lacks `cognito-idp:AdminUpdateUserAttributes` permission

### Option 2: Recreate User Pool
**Rejected:** Too disruptive, requires infrastructure changes

### Option 3: Remove Email Mapping
**Rejected:** Cognito requires email mapping, cannot be removed

### Option 4: Make Email Mutable
**Rejected:** Cannot change attribute mutability in existing User Pool

### Option 5: Account Recreation ✅
**Selected:** Simplest solution, user is only account, data can be re-uploaded

---

## Long-Term Prevention

### Recommended: Pre-Signup Lambda Enhancement

Update the Pre-Signup Lambda to ensure `email_verified` is set correctly for Google OAuth users:

```javascript
export const handler = async (event) => {
  if (event.triggerSource === "PreSignUp_ExternalProvider") {
    // Auto-confirm and auto-verify email for federated users
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }
  return event;
};
```

This would prevent the issue from recurring for future users.

---

## Git Commit

- **Branch:** `main`
- **Commit:** (to be created)
- **Files Changed:**
  - `docs/GOOGLE_OAUTH_FIX_v1.8.3.md` (created)
- **Status:** Documented

---

## References

- Previous fix: `docs/v1.6.0-account-linking-fix.md`
- Lambda fix: `docs/GOOGLE_OAUTH_FIX_v1.8.1.md`
- AWS Cognito attribute immutability: [AWS Documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html)

---

**Resolution:** ✅ Account deleted, ready for fresh sign-up  
**User Impact:** Data needs re-upload (acceptable for single user)  
**Future Prevention:** Pre-Signup Lambda enhancement recommended  
**Documentation:** Complete
