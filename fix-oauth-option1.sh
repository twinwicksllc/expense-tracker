#!/bin/bash
# Fix Google OAuth - Option 1: Remove Email from Attribute Mapping
# This script updates the Google Identity Provider to stop mapping email attribute
# This prevents Cognito from trying to update the immutable email field on every login

set -e

echo "=========================================="
echo "Google OAuth Fix - Option 1"
echo "Remove Email from Attribute Mapping"
echo "=========================================="
echo ""

# Configuration
USER_POOL_ID="us-east-1_7H7R5DVZT"
PROVIDER_NAME="Google"
REGION="us-east-1"

echo "Step 1: Checking current configuration..."
echo ""

# Get current attribute mapping
CURRENT_MAPPING=$(aws cognito-idp describe-identity-provider \
  --user-pool-id $USER_POOL_ID \
  --provider-name $PROVIDER_NAME \
  --region $REGION \
  --query 'IdentityProvider.AttributeMapping' \
  --output json)

echo "Current Attribute Mapping:"
echo "$CURRENT_MAPPING" | jq .
echo ""

# Check if email is in the mapping
if echo "$CURRENT_MAPPING" | jq -e '.email' > /dev/null; then
  echo "✅ Email mapping found - will be removed"
else
  echo "⚠️  Email mapping not found - may already be removed"
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo ""
echo "Step 2: Creating new attribute mapping (without email)..."
echo ""

# Create new mapping without email
# Keep name and username mappings
NEW_MAPPING='{
  "name": "name",
  "username": "sub"
}'

echo "New Attribute Mapping:"
echo "$NEW_MAPPING" | jq .
echo ""

read -p "Proceed with update? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

echo ""
echo "Step 3: Updating Google Identity Provider..."
echo ""

# Update the identity provider
aws cognito-idp update-identity-provider \
  --user-pool-id $USER_POOL_ID \
  --provider-name $PROVIDER_NAME \
  --region $REGION \
  --attribute-mapping "$NEW_MAPPING"

echo ""
echo "✅ Update complete!"
echo ""

echo "Step 4: Verifying changes..."
echo ""

# Verify the update
UPDATED_MAPPING=$(aws cognito-idp describe-identity-provider \
  --user-pool-id $USER_POOL_ID \
  --provider-name $PROVIDER_NAME \
  --region $REGION \
  --query 'IdentityProvider.AttributeMapping' \
  --output json)

echo "Updated Attribute Mapping:"
echo "$UPDATED_MAPPING" | jq .
echo ""

# Check if email was removed
if echo "$UPDATED_MAPPING" | jq -e '.email' > /dev/null; then
  echo "❌ ERROR: Email mapping still present!"
  exit 1
else
  echo "✅ SUCCESS: Email mapping removed!"
fi

echo ""
echo "=========================================="
echo "Fix Applied Successfully!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Delete your current user account in Cognito"
echo "2. Sign up again with Google OAuth"
echo "3. Try logging in again with Google"
echo "4. If successful, the workaround is working!"
echo ""
echo "Note: This is a workaround, not a permanent fix."
echo "Email will only be set during initial sign-up."
echo "Plan to recreate User Pool with mutable email for permanent solution."
echo ""