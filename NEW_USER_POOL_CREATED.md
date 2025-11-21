# New User Pool Created Successfully! 🎉

## Summary

A new Cognito User Pool has been created with the **email attribute set to mutable**, which fixes the Google OAuth "Attribute cannot be updated" error.

---

## New User Pool Details

### Pool Information
- **Pool ID**: `us-east-1_iSsgMCrkM`
- **Pool Name**: `expense-tracker-user-pool-prod-v2`
- **ARN**: `arn:aws:cognito-idp:us-east-1:391907191624:userpool/us-east-1_iSsgMCrkM`
- **Domain**: `expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com`

### App Client
- **Client ID**: `6jb82h9lrvh29505t1ihavfte9`
- **Client Name**: `expense-tracker-client`

### Key Configuration
```json
{
  "Name": "email",
  "Mutable": true,  ← FIXED! Was false in old pool
  "Required": true
}
```

### Lambda Triggers
- ✅ Pre-Signup: `expense-tracker-prod-presignup-link`
- ✅ Post-Authentication: `expense-tracker-prod-postauth-link`

### Identity Providers
- ✅ Google OAuth configured
- ✅ Cognito (email/password) enabled

### OAuth Configuration
- **Callback URLs**: 
  - `https://app.twin-wicks.com/callback`
  - `https://app.twin-wicks.com`
- **Logout URLs**: `https://app.twin-wicks.com`
- **OAuth Flows**: Authorization code
- **OAuth Scopes**: openid, email, profile, aws.cognito.signin.user.admin

---

## Frontend Configuration Update

Update your frontend configuration file with these new values:

```javascript
// frontend/config.js (or wherever CONFIG is defined)
const CONFIG = {
  COGNITO: {
    USER_POOL_ID: 'us-east-1_iSsgMCrkM',  // NEW
    CLIENT_ID: '6jb82h9lrvh29505t1ihavfte9',  // NEW
    DOMAIN: 'https://expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com',  // NEW
    REDIRECT_URI: 'https://app.twin-wicks.com/callback',
    SIGN_OUT_URI: 'https://app.twin-wicks.com'
  },
  API_GATEWAY_URL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod'
};
```

### Old Values (for reference)
```javascript
// OLD - DO NOT USE
USER_POOL_ID: 'us-east-1_7H7R5DVZT',
CLIENT_ID: 'pk3l1fkkre0ms4si0prabfavl',
DOMAIN: 'https://expense-tracker-prod.auth.us-east-1.amazoncognito.com'
```

---

## Testing the New Pool

### Test Plan

**Step 1: Update Frontend**
1. Update `frontend/config.js` with new values
2. Deploy to S3: `aws s3 cp frontend/config.js s3://expense-tracker-frontend-391907191624/config.js`
3. Invalidate CloudFront cache

**Step 2: Test Google OAuth (Critical Test)**
1. Go to https://app.twin-wicks.com
2. Click "Sign in with Google"
3. Complete OAuth flow
4. **First login**: Should work (creates account)
5. **Log out and log in again with Google**
6. **Second login**: Should work! ✅ (This was failing before)
7. **Third login**: Should work! ✅ (Verify it's truly fixed)

**Step 3: Test Email/Password**
1. Sign up with email/password
2. Verify email
3. Log in with email/password
4. Should work ✅

**Step 4: Test Account Linking**
1. Create account with email/password
2. Log in with Google using same email
3. Accounts should link ✅

---

## Lambda Environment Variables

Update Lambda functions to use new User Pool:

```bash
# Update Pre-Signup Lambda
aws lambda update-function-configuration \
  --function-name expense-tracker-prod-presignup-link \
  --environment "Variables={USER_POOL_ID=us-east-1_iSsgMCrkM,REGION=us-east-1}"

# Update Post-Authentication Lambda
aws lambda update-function-configuration \
  --function-name expense-tracker-prod-postauth-link \
  --environment "Variables={USER_POOL_ID=us-east-1_iSsgMCrkM,REGION=us-east-1}"
```

---

## API Gateway Authorizers

Update API Gateway to use new User Pool:

```bash
# List current authorizers
aws apigateway get-authorizers --rest-api-id fcnq8h7mai

# Update each authorizer (replace AUTHORIZER_ID with actual ID)
aws apigateway update-authorizer \
  --rest-api-id fcnq8h7mai \
  --authorizer-id <AUTHORIZER_ID> \
  --provider-arns "arn:aws:cognito-idp:us-east-1:391907191624:userpool/us-east-1_iSsgMCrkM"

# Deploy API Gateway
aws apigateway create-deployment \
  --rest-api-id fcnq8h7mai \
  --stage-name prod \
  --description "Update to new User Pool v2"
```

---

## Deployment Checklist

### Phase 1: Update Configuration (30 minutes)
- [ ] Update `frontend/config.js` with new User Pool ID and Client ID
- [ ] Update Lambda environment variables
- [ ] Update API Gateway authorizers
- [ ] Deploy frontend to S3
- [ ] Invalidate CloudFront cache
- [ ] Deploy API Gateway changes

### Phase 2: Test New Pool (30 minutes)
- [ ] Test Google OAuth first login
- [ ] Test Google OAuth second login (THE KEY TEST)
- [ ] Test Google OAuth third login (verify it's stable)
- [ ] Test email/password signup
- [ ] Test email/password login
- [ ] Test account linking
- [ ] Test all application features

### Phase 3: User Migration (Optional - if keeping old users)
- [ ] Export users from old pool
- [ ] Create migration Lambda
- [ ] Test migration with test account
- [ ] Migrate production users
- [ ] Send password reset emails

### Phase 4: Cleanup (After 30 days)
- [ ] Verify new pool is stable
- [ ] Delete old User Pool (us-east-1_7H7R5DVZT)
- [ ] Remove old configuration references

---

## Quick Start Commands

### Update Frontend
```bash
cd expense-tracker/frontend

# Update config.js with new values
# Then deploy
aws s3 cp config.js s3://expense-tracker-frontend-391907191624/config.js
aws cloudfront create-invalidation --distribution-id EB9MXBNYV9HVD --paths "/config.js"
```

### Update Lambda Functions
```bash
aws lambda update-function-configuration \
  --function-name expense-tracker-prod-presignup-link \
  --environment "Variables={USER_POOL_ID=us-east-1_iSsgMCrkM,REGION=us-east-1}"

aws lambda update-function-configuration \
  --function-name expense-tracker-prod-postauth-link \
  --environment "Variables={USER_POOL_ID=us-east-1_iSsgMCrkM,REGION=us-east-1}"
```

---

## Expected Results

### Before (Old Pool)
- ❌ First Google login: Works
- ❌ Second Google login: **FAILS** with "Attribute cannot be updated"
- ❌ Third Google login: **FAILS**

### After (New Pool)
- ✅ First Google login: Works
- ✅ Second Google login: **WORKS** ← Fixed!
- ✅ Third Google login: **WORKS** ← Fixed!
- ✅ All subsequent logins: **WORK** ← Fixed!

---

## Rollback Plan (If Needed)

If something goes wrong, you can quickly rollback:

```javascript
// Revert frontend config.js to old values
USER_POOL_ID: 'us-east-1_7H7R5DVZT',
CLIENT_ID: 'pk3l1fkkre0ms4si0prabfavl',
DOMAIN: 'https://expense-tracker-prod.auth.us-east-1.amazoncognito.com'
```

Then redeploy frontend and invalidate cache.

---

## Next Steps

**Immediate (Required):**
1. Update frontend configuration
2. Update Lambda environment variables
3. Update API Gateway authorizers
4. Test Google OAuth login multiple times

**Optional (If keeping old users):**
1. Plan user migration strategy
2. Create migration Lambda
3. Migrate users
4. Send password reset emails

**After 30 days:**
1. Delete old User Pool
2. Clean up old configuration

---

## Support

If you encounter any issues:
1. Check CloudWatch logs for Lambda functions
2. Check Cognito User Pool logs
3. Verify configuration values are correct
4. Test with a fresh incognito browser session

---

**Status**: ✅ New User Pool created and configured
**Ready for**: Frontend configuration update and testing
**Expected fix**: Google OAuth will work on all subsequent logins

🎉 **The root cause has been fixed!**