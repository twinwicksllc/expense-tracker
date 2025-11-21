#!/bin/bash

API_ID="fcnq8h7mai"

# List of all response types that need updating
RESPONSE_TYPES=(
    "INTEGRATION_FAILURE"
    "RESOURCE_NOT_FOUND"
    "REQUEST_TOO_LARGE"
    "THROTTLED"
    "UNSUPPORTED_MEDIA_TYPE"
    "AUTHORIZER_CONFIGURATION_ERROR"
    "DEFAULT_5XX"
    "DEFAULT_4XX"
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
)

echo "Updating API Gateway Response configurations for API: $API_ID"
echo "================================================================"

for RESPONSE_TYPE in "${RESPONSE_TYPES[@]}"; do
    echo "Updating $RESPONSE_TYPE..."
    
    aws apigateway update-gateway-response \
        --rest-api-id "$API_ID" \
        --response-type "$RESPONSE_TYPE" \
        --patch-operations \
            op=replace,path=/responseParameters/gatewayresponse.header.Access-Control-Allow-Origin,value="'*'" \
        --output json > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Updated $RESPONSE_TYPE"
    else
        echo "  ✗ Failed to update $RESPONSE_TYPE"
    fi
done

echo ""
echo "Creating new deployment to activate changes..."
aws apigateway create-deployment \
    --rest-api-id "$API_ID" \
    --stage-name prod \
    --description "Updated CORS origin to allow all domains (teckstart.com migration)" \
    --output json

echo ""
echo "✓ All gateway responses updated and deployed!"