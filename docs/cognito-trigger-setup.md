# Cognito Post-Authentication Trigger Setup

## Status: Lambda Function Created ✅

The Lambda function `expense-tracker-prod-postauth-link` has been successfully created and is ready to use.

**Function ARN:** `arn:aws:lambda:us-east-1:391907191624:function:expense-tracker-prod-postauth-link`

---

## Manual Configuration Required

To complete the account linking setup, you need to configure the Cognito User Pool to use this Lambda as a Post-Authentication trigger.

### Option 1: AWS Console (Recommended - 2 minutes)

1. **Open AWS Cognito Console**
   - Navigate to: https://console.aws.amazon.com/cognito/v2/idp/user-pools
   - Region: US East (N. Virginia) - us-east-1

2. **Select Your User Pool**
   - Click on user pool: `us-east-1_7H7R5DVZT`

3. **Configure Lambda Triggers**
   - In the left sidebar, click **"User pool properties"**
   - Scroll down to **"Lambda triggers"**
   - Click **"Add Lambda trigger"**

4. **Add Post-Authentication Trigger**
   - Trigger type: **Post authentication**
   - Lambda function: Select `expense-tracker-prod-postauth-link`
   - Click **"Add Lambda trigger"**

5. **Verify Configuration**
   - You should see the trigger listed under "Lambda triggers"
   - Status should show as "Active"

---

### Option 2: AWS CLI (If you have permissions)

Grant the manus-agent IAM user permission to update Cognito User Pools, then run:

```bash
aws cognito-idp update-user-pool \
  --user-pool-id us-east-1_7H7R5DVZT \
  --lambda-config PostAuthentication=arn:aws:lambda:us-east-1:391907191624:function:expense-tracker-prod-postauth-link
```

**Required IAM Permission:**
```json
{
  "Effect": "Allow",
  "Action": [
    "cognito-idp:UpdateUserPool",
    "cognito-idp:DescribeUserPool"
  ],
  "Resource": "arn:aws:cognito-idp:us-east-1:391907191624:userpool/us-east-1_7H7R5DVZT"
}
```

---

## Verification Steps

After configuring the trigger:

### 1. Check CloudWatch Logs

```bash
aws logs tail /aws/lambda/expense-tracker-prod-postauth-link --follow
```

### 2. Test Authentication

1. Sign in with email/password account
2. Check CloudWatch logs for trigger execution
3. Sign out
4. Sign in with Google OAuth (same email)
5. Check logs for account linking activity

### 3. Expected Log Output

**First Sign-In (No Linking):**
```
Post-Authentication trigger event: {...}
Authentication details: { email: 'user@example.com', emailVerified: 'true', ... }
No other account found with this email, no linking needed
```

**Second Sign-In (Linking Occurs):**
```
Post-Authentication trigger event: {...}
Authentication details: { email: 'user@example.com', emailVerified: 'true', ... }
Found existing account: { username: 'abc123', email: 'user@example.com' }
Linking accounts: { nativeUsername: 'abc123', providerName: 'Google', ... }
AdminLinkProviderForUser successful
Accounts linked successfully: { email: 'user@example.com', ... }
```

---

## Troubleshooting

### Lambda Not Triggering

**Check:**
- Cognito trigger is configured correctly in the console
- Lambda has permission to be invoked by Cognito (already configured ✅)
- CloudWatch Logs group exists: `/aws/lambda/expense-tracker-prod-postauth-link`

**Solution:**
```bash
# Verify trigger configuration
aws cognito-idp describe-user-pool --user-pool-id us-east-1_7H7R5DVZT \
  | jq '.UserPool.LambdaConfig'
```

### Linking Fails

**Check CloudWatch Logs for errors:**
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/expense-tracker-prod-postauth-link \
  --filter-pattern "ERROR"
```

**Common Issues:**
- Email not verified on one account → Linking skipped (expected behavior)
- Both accounts are same type (both native or both federated) → No linking needed
- IAM permissions missing → Check Lambda execution role has Cognito permissions

### Accounts Already Linked

If you see:
```
Accounts already linked, treating as success
```

This is normal and indicates the accounts were linked on a previous sign-in.

---

## Rollback

If you need to remove the trigger:

### AWS Console
1. Go to Cognito User Pool → User pool properties → Lambda triggers
2. Find the Post-Authentication trigger
3. Click "Remove"

### AWS CLI
```bash
aws cognito-idp update-user-pool \
  --user-pool-id us-east-1_7H7R5DVZT \
  --lambda-config '{}'
```

---

## Next Steps

After configuring the trigger:

1. ✅ Verify trigger is active in Cognito console
2. ✅ Test with real user accounts
3. ✅ Monitor CloudWatch logs for first 24 hours
4. ✅ Update CHANGELOG.md with v1.6.0 changes
5. ✅ Deploy frontend updates (if any)
6. ✅ Commit to Git

---

## Support

If you encounter issues:

1. Check CloudWatch Logs: `/aws/lambda/expense-tracker-prod-postauth-link`
2. Review Lambda function code: `/home/ubuntu/expense-tracker/lambda/post-authentication-link.js`
3. Verify IAM permissions on Lambda execution role
4. Test with different account combinations (email/password first, Google first)

---

**Lambda Function Details:**
- Name: `expense-tracker-prod-postauth-link`
- Runtime: Node.js 22.x
- Handler: `post-authentication-link.handler`
- Timeout: 10 seconds
- Memory: 256 MB
- Environment Variables:
  - `USER_POOL_ID`: us-east-1_7H7R5DVZT
  - `REGION`: us-east-1
