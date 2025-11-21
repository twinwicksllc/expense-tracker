# Option 1 Failed - Analysis and Next Steps

## What We Tried
We attempted to remove the `email` attribute from the Google Identity Provider's attribute mapping to prevent Cognito from trying to update the immutable email field.

## Why It Failed

### The Attempt
```bash
aws cognito-idp update-identity-provider \
  --user-pool-id us-east-1_7H7R5DVZT \
  --provider-name Google \
  --attribute-mapping '{"name":"name","username":"sub"}'
```

### The Error
```
InvalidParameterException: The attribute mapping is missing required attributes [email]
```

### Root Cause
The email attribute has two conflicting configurations:

```json
{
  "Name": "email",
  "Required": true,      ← Must be mapped from IdP
  "Mutable": false       ← Cannot be updated after creation
}
```

**This creates an impossible situation:**
- Cognito REQUIRES email to be mapped from Google (Required: true)
- Cognito CANNOT update email on subsequent logins (Mutable: false)
- Result: First login works (sets email), subsequent logins fail (tries to update email)

## Why This Confirms Your Analysis

Your technical review was 100% correct:

✅ **Identified**: Email is immutable  
✅ **Identified**: Email is required  
✅ **Identified**: Attribute mapping happens on every login  
✅ **Identified**: Code fixes cannot resolve this  
✅ **Conclusion**: User Pool must be recreated  

## The Only Solution: Recreate User Pool

Since:
1. ❌ We cannot remove email from attribute mapping (required)
2. ❌ We cannot make email mutable (immutable by design, cannot be changed)
3. ❌ We cannot prevent attribute mapping on login (Cognito behavior)

**We MUST recreate the User Pool with email set to Mutable: true**

## Next Steps - User Pool Recreation

### Phase 1: Create New User Pool (1-2 hours)

**Step 1: Create User Pool with Mutable Email**
```bash
aws cognito-idp create-user-pool \
  --pool-name expense-tracker-user-pool-prod-v2 \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 8,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": true
    }
  }' \
  --schema '[
    {
      "Name": "email",
      "AttributeDataType": "String",
      "Mutable": true,
      "Required": true,
      "StringAttributeConstraints": {
        "MinLength": "0",
        "MaxLength": "2048"
      }
    },
    {
      "Name": "name",
      "AttributeDataType": "String",
      "Mutable": true,
      "Required": false
    }
  ]' \
  --auto-verified-attributes email \
  --username-attributes email \
  --mfa-configuration OFF \
  --email-configuration '{
    "EmailSendingAccount": "COGNITO_DEFAULT"
  }'
```

**Step 2: Configure Lambda Triggers**
```bash
NEW_POOL_ID="<from step 1>"

aws cognito-idp update-user-pool \
  --user-pool-id $NEW_POOL_ID \
  --lambda-config '{
    "PreSignUp": "arn:aws:lambda:us-east-1:391907191624:function:expense-tracker-prod-presignup-link",
    "PostAuthentication": "arn:aws:lambda:us-east-1:391907191624:function:expense-tracker-prod-postauth-link"
  }'
```

**Step 3: Create App Client**
```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id $NEW_POOL_ID \
  --client-name expense-tracker-client \
  --generate-secret \
  --supported-identity-providers Google COGNITO \
  --callback-urls https://app.twin-wicks.com/callback \
  --logout-urls https://app.twin-wicks.com \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client
```

**Step 4: Create User Pool Domain**
```bash
aws cognito-idp create-user-pool-domain \
  --user-pool-id $NEW_POOL_ID \
  --domain expense-tracker-prod-v2
```

**Step 5: Configure Google Identity Provider**
```bash
aws cognito-idp create-identity-provider \
  --user-pool-id $NEW_POOL_ID \
  --provider-name Google \
  --provider-type Google \
  --provider-details '{
    "client_id": "314274747743-dkheg7qbpot3od2foek92d5njj9bqscp.apps.googleusercontent.com",
    "client_secret": "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",
    "authorize_scopes": "profile email openid",
    "attributes_url": "https://people.googleapis.com/v1/people/me?personFields=",
    "attributes_url_add_attributes": "true",
    "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
    "oidc_issuer": "https://accounts.google.com",
    "token_request_method": "POST",
    "token_url": "https://www.googleapis.com/oauth2/v4/token"
  }' \
  --attribute-mapping '{
    "email": "email",
    "name": "name",
    "username": "sub"
  }'
```

### Phase 2: Update Application (30 minutes)

**Update Frontend Configuration**
```javascript
// frontend/config.js or wherever CONFIG is defined
const CONFIG = {
  COGNITO: {
    USER_POOL_ID: '<NEW_POOL_ID>',
    CLIENT_ID: '<NEW_CLIENT_ID>',
    DOMAIN: 'https://expense-tracker-prod-v2.auth.us-east-1.amazoncognito.com',
    REDIRECT_URI: 'https://app.twin-wicks.com/callback',
    SIGN_OUT_URI: 'https://app.twin-wicks.com'
  }
};
```

**Update Lambda Environment Variables**
```bash
# Update all Lambda functions that use USER_POOL_ID
aws lambda update-function-configuration \
  --function-name expense-tracker-prod-presignup-link \
  --environment "Variables={USER_POOL_ID=$NEW_POOL_ID}"

aws lambda update-function-configuration \
  --function-name expense-tracker-prod-postauth-link \
  --environment "Variables={USER_POOL_ID=$NEW_POOL_ID}"
```

**Update API Gateway Authorizers**
```bash
# Get API Gateway authorizers
aws apigateway get-authorizers --rest-api-id fcnq8h7mai

# Update each authorizer with new User Pool ARN
aws apigateway update-authorizer \
  --rest-api-id fcnq8h7mai \
  --authorizer-id <AUTHORIZER_ID> \
  --provider-arns "arn:aws:cognito-idp:us-east-1:391907191624:userpool/$NEW_POOL_ID"
```

### Phase 3: User Migration Strategy

**Option A: Automatic Migration (Recommended)**

Create a User Migration Lambda:
```javascript
export const handler = async (event) => {
  if (event.triggerSource === 'UserMigration_Authentication') {
    // Authenticate user in old pool
    const oldPoolAuth = await authenticateInOldPool(
      event.userName,
      event.request.password
    );
    
    if (oldPoolAuth.success) {
      return {
        response: {
          userAttributes: {
            email: oldPoolAuth.email,
            name: oldPoolAuth.name,
            email_verified: 'true'
          },
          finalUserStatus: 'CONFIRMED',
          messageAction: 'SUPPRESS'
        }
      };
    }
  }
  
  throw new Error('User not found');
};
```

**Option B: Manual Migration**

1. Export users from old pool
2. Send password reset emails
3. Users reset password and are created in new pool

### Phase 4: Testing (1 hour)

**Test Checklist:**
- [ ] Email/password sign-up
- [ ] Email/password login
- [ ] Google OAuth sign-up
- [ ] Google OAuth login (first time)
- [ ] Google OAuth login (subsequent times) ← THE KEY TEST
- [ ] Account linking (Google + email/password)
- [ ] Password reset
- [ ] All application features

### Phase 5: Deployment & Cutover (30 minutes)

1. Deploy frontend with new User Pool ID
2. Deploy Lambda updates
3. Update API Gateway
4. Monitor CloudWatch logs
5. Test production
6. Keep old pool as backup for 30 days

## Estimated Timeline

| Phase | Time | Can Start |
|-------|------|-----------|
| Create New Pool | 1-2 hrs | Immediately |
| Update Application | 30 min | After Phase 1 |
| User Migration | 2-3 hrs | After Phase 2 |
| Testing | 1 hr | After Phase 3 |
| Deployment | 30 min | After Phase 4 |
| **Total** | **5-7 hrs** | |

## Decision Point

**What would you like to do?**

1. **Start User Pool Recreation Now** (5-7 hours total)
   - I can guide you through each step
   - We can do it in phases over multiple sessions
   - This is the only permanent fix

2. **Plan for Later** (Document and schedule)
   - I'll create detailed step-by-step guide
   - You can execute when you have time
   - I'll be available to help when you're ready

3. **Temporary Workaround** (Delete user each time)
   - Not recommended
   - Data loss on each deletion
   - Poor user experience
   - But allows you to use the app now

## My Recommendation

**Start Phase 1 now (1-2 hours):**
- Create the new User Pool
- Configure it properly
- Test Google OAuth with a fresh account
- Verify it works before migrating users

**Then schedule Phases 2-5 for when you have 3-4 hours:**
- Update application
- Migrate users
- Deploy to production

This way you can verify the fix works before committing to the full migration.

---

**Ready to proceed when you are. Let me know which option you prefer!**