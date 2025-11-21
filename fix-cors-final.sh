#!/bin/bash

API_ID="fcnq8h7mai"

# Array of response types with their status codes
declare -A RESPONSE_CONFIGS=(
    ["INTEGRATION_FAILURE"]="504"
    ["RESOURCE_NOT_FOUND"]="404"
    ["REQUEST_TOO_LARGE"]="413"
    ["THROTTLED"]="429"
    ["UNSUPPORTED_MEDIA_TYPE"]="415"
    ["AUTHORIZER_CONFIGURATION_ERROR"]="500"
    ["BAD_REQUEST_PARAMETERS"]="400"
    ["BAD_REQUEST_BODY"]="400"
    ["WAF_FILTERED"]="403"
    ["EXPIRED_TOKEN"]="403"
    ["ACCESS_DENIED"]="403"
    ["INVALID_API_KEY"]="403"
    ["UNAUTHORIZED"]="401"
    ["API_CONFIGURATION_ERROR"]="500"
    ["QUOTA_EXCEEDED"]="429"
    ["INTEGRATION_TIMEOUT"]="504"
    ["MISSING_AUTHENTICATION_TOKEN"]="403"
    ["INVALID_SIGNATURE"]="403"
    ["AUTHORIZER_FAILURE"]="500"
)

# Special cases without status codes
SPECIAL_TYPES=("DEFAULT_5XX" "DEFAULT_4XX")

echo "Fixing API Gateway CORS for API: $API_ID"
echo "================================================================"

# Delete and recreate responses with status codes
for RESPONSE_TYPE in "${!RESPONSE_CONFIGS[@]}"; do
    STATUS_CODE="${RESPONSE_CONFIGS[$RESPONSE_TYPE]}"
    echo "Processing $RESPONSE_TYPE (status: $STATUS_CODE)..."
    
    # Delete existing
    aws apigateway delete-gateway-response \
        --rest-api-id "$API_ID" \
        --response-type "$RESPONSE_TYPE" \
        2>/dev/null
    
    # Create new with wildcard origin using JSON format
    aws apigateway put-gateway-response \
        --rest-api-id "$API_ID" \
        --response-type "$RESPONSE_TYPE" \
        --status-code "$STATUS_CODE" \
        --response-parameters '{
            "gatewayresponse.header.Access-Control-Allow-Origin": "'"'"'*'"'"'",
            "gatewayresponse.header.Access-Control-Allow-Headers": "'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"'"'",
            "gatewayresponse.header.Access-Control-Allow-Methods": "'"'"'OPTIONS,GET,POST,PUT,DELETE'"'"'"
        }' \
        --response-templates '{"application/json": "{&quot;message&quot;:$context.error.messageString}"}' \
        --output json > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Updated $RESPONSE_TYPE"
    else
        echo "  ✗ Failed to update $RESPONSE_TYPE"
    fi
done

# Handle special types (DEFAULT_5XX and DEFAULT_4XX)
for RESPONSE_TYPE in "${SPECIAL_TYPES[@]}"; do
    echo "Processing $RESPONSE_TYPE..."
    
    # Delete existing
    aws apigateway delete-gateway-response \
        --rest-api-id "$API_ID" \
        --response-type "$RESPONSE_TYPE" \
        2>/dev/null
    
    # Create new with wildcard origin (no status code for defaults)
    aws apigateway put-gateway-response \
        --rest-api-id "$API_ID" \
        --response-type "$RESPONSE_TYPE" \
        --response-parameters '{
            "gatewayresponse.header.Access-Control-Allow-Origin": "'"'"'*'"'"'",
            "gatewayresponse.header.Access-Control-Allow-Headers": "'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"'"'",
            "gatewayresponse.header.Access-Control-Allow-Methods": "'"'"'OPTIONS,GET,POST,PUT,DELETE'"'"'"
        }' \
        --response-templates '{"application/json": "{&quot;message&quot;:$context.error.messageString}"}' \
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
    --description "Fixed CORS to wildcard for teckstart.com" \
    --output json

echo ""
echo "✓ All gateway responses fixed and deployed!"
echo ""
echo "Verifying one response..."
aws apigateway get-gateway-response \
    --rest-api-id "$API_ID" \
    --response-type "UNAUTHORIZED" \
    --query 'responseParameters' \
    --output json