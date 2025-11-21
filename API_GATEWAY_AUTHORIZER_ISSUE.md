# API Gateway Authorizer Update Issue

## Problem
Cannot update the API Gateway authorizer's `providerARNs` to point to the new User Pool. API Gateway only allows updating specific fields, and `providerARNs` is not one of them.

## Attempted Solutions

### Attempt 1: Patch Operation
```bash
aws apigateway update-authorizer --patch-operations "op=replace,path=/providerARNs/0,value=..."
```
**Result**: ❌ Error - `/providerARNs` is not an updatable field

### Attempt 2: Delete and Recreate
```bash
aws apigateway delete-authorizer --authorizer-id loh0jq
```
**Result**: ❌ Error - "Cannot delete authorizer, is referenced in method: POST//expenses"

## Current State

- **Old Authorizer**: Points to old User Pool (`us-east-1_7H7R5DVZT`)
- **New User Pool**: `us-east-1_iSsgMCrkM`
- **Issue**: API Gateway will validate tokens against OLD User Pool

## Workaround Options

### Option A: Remove Authorizer from Methods (Quick)
Remove the authorizer from all methods and rely on Lambda functions to validate tokens.

**Pros:**
- ✅ Quick to implement
- ✅ Lambda functions already validate tokens
- ✅ No API Gateway changes needed

**Cons:**
- ❌ Less secure (no API Gateway-level validation)
- ❌ More Lambda execution time

### Option B: Create New Authorizer (Recommended)
Create a new authorizer with a different name, then update all methods to use it.

**Steps:**
1. Create new authorizer: `CognitoAuthorizerV2`
2. Update each method to use new authorizer
3. Deploy API Gateway
4. Delete old authorizer

**Pros:**
- ✅ Maintains API Gateway-level security
- ✅ Proper architecture
- ✅ Can delete old authorizer after

**Cons:**
- ❌ Need to update ~15 methods
- ❌ More complex deployment

### Option C: Dual Authorizers (Temporary)
Keep both authorizers temporarily during migration.

**Steps:**
1. Create new authorizer: `CognitoAuthorizerV2`
2. Gradually migrate methods to new authorizer
3. Once all methods migrated, delete old authorizer

**Pros:**
- ✅ Allows gradual migration
- ✅ Can rollback easily
- ✅ Less risky

**Cons:**
- ❌ Temporary complexity
- ❌ Need to track which methods use which authorizer

## Recommended Approach

**Use Option B: Create New Authorizer**

This is the cleanest solution and maintains proper security architecture.

## Implementation

I'll create a script to:
1. Create new authorizer with new name
2. Get all methods that use old authorizer
3. Update each method to use new authorizer
4. Deploy API Gateway
5. Verify all methods work
6. Delete old authorizer

This will take about 15-20 minutes to execute.

## Alternative: Skip Authorizer Update

If you want to test the Google OAuth fix immediately without dealing with the authorizer:

**The Lambda functions validate tokens themselves**, so the API Gateway authorizer is an additional layer of security but not strictly required for functionality.

You could:
1. Test Google OAuth with the current setup
2. If it works, deal with authorizer later
3. The Lambda functions will validate against the new User Pool

**Security Note**: This is less secure but functional. The proper fix is to update the authorizer.

## Decision Needed

What would you like to do?

1. **Create new authorizer and update all methods** (15-20 minutes, proper fix)
2. **Test without updating authorizer** (immediate, less secure but functional)
3. **Create dual authorizers** (gradual migration approach)

Let me know and I'll proceed accordingly!