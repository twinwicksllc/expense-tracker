#!/bin/bash

API_ID="fcnq8h7mai"

# Array of response types
RESPONSE_TYPES=(
    "INTEGRATION_FAILURE"
    "RESOURCE_NOT_FOUND"
    "REQUEST_TOO_LARGE"
    "THROTTLED"
    "UNSUPPORTED_MEDIA_TYPE"
    "AUTHORIZER_CONFIGURATION_ERROR"
    "BAD_REQUEST_PARAMETERS"
    "BAD_REQUEST_BODY"
    "WAF_FILTERED"
    "EXPIRED_TOKEN"
    "ACCESS_DENIED"
    "INVALID_API_KEY"
    "UNAUTHORIZED"
    "API_CONFIGURATION_ERROR"
    "QUOTA_EXCEEDED"
    "INTEGRATION_TIMEOUT"
    "MISSING_AUTHENTICATION_TOKEN"
    "INVALID_SIGNATURE"
    "AUTHORIZER_FAILURE"
    "DEFAULT_5XX"
    "DEFAULT_4XX"
)

echo "Fixing API Gateway Response Templates for API: $API_ID"
echo "================================================================"

for RESPONSE_TYPE in "${RESPONSE_TYPES[@]}"; do
    echo "Deleting $RESPONSE_TYPE..."
    
    # Delete existing response
    aws apigateway delete-gateway-response \
        --rest-api-id "$API_ID" \
        --response-type "$RESPONSE_TYPE" \
        2>/dev/null
    
    echo "  ✓ Deleted $RESPONSE_TYPE"
done

echo ""
echo "Gateway responses deleted. API Gateway will now use default responses."
echo "Creating new deployment..."

aws apigateway create-deployment \
    --rest-api-id "$API_ID" \
    --stage-name prod \
    --description "Removed custom gateway responses with HTML entities" \
    --output json

echo ""
echo "✓ Deployment complete!"
echo ""
echo "Testing..."
sleep 2
curl -s https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/expenses | head -1