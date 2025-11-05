# CORS Troubleshooting Guide

## Overview

This document provides detailed information about CORS (Cross-Origin Resource Sharing) configuration in the Expense Tracker application and how to troubleshoot common CORS issues.

## Background

The Expense Tracker frontend is hosted at `https://app.twin-wicks.com` and makes API requests to `https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com`. Because these are different origins, browsers enforce CORS policies that require proper configuration on the API Gateway.

## CORS Configuration

### Current Setup

All API endpoints are configured with CORS headers to allow cross-origin requests from the frontend application.

**Allowed Origin**: `*` (wildcard - allows all origins)  
**Allowed Methods**: `OPTIONS, GET, POST, PUT, DELETE`  
**Allowed Headers**: `Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent`

### OPTIONS Method Configuration

Each endpoint has an OPTIONS method configured for CORS preflight requests:

- **Integration Type**: MOCK
- **Request Template**: `{statusCode:200}` (JavaScript object notation)
- **Authorization**: NONE (OPTIONS must not require authentication)
- **Response**: HTTP 200 with CORS headers

## Common Issues and Solutions

### Issue 1: HTTP 500 on OPTIONS Requests

**Symptoms**:
- Browser console shows: "Response to preflight request doesn't pass access control check: It does not have HTTP ok status"
- OPTIONS request returns HTTP 500
- CORS headers may be present but browser rejects the response

**Root Cause**: Incorrect request template format in MOCK integration

**Solution**:
The MOCK integration request template must use JavaScript object notation, not JSON:

✅ **Correct**: `{statusCode:200}`  
❌ **Wrong**: `{"statusCode": 200}`

**How to Fix**:
```bash
# Update the integration request template
aws apigateway put-integration \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{statusCode:200}"}'

# Deploy to prod
aws apigateway create-deployment \
  --rest-api-id fcnq8h7mai \
  --stage-name prod
```

### Issue 2: HTTP 403 "Missing Authentication Token"

**Symptoms**:
- OPTIONS request returns HTTP 403
- Response body: `{"message":"Missing Authentication Token"}`

**Root Cause**: Route not properly deployed to the stage

**Solution**:
Create a new deployment to register the route:

```bash
aws apigateway create-deployment \
  --rest-api-id fcnq8h7mai \
  --stage-name prod \
  --description "Deploy new routes"
```

Wait 10-15 seconds for deployment to propagate, then test again.

### Issue 3: OPTIONS Method Requires Authorization

**Symptoms**:
- OPTIONS request returns HTTP 401 or 403
- Error mentions authorization or authentication

**Root Cause**: OPTIONS method configured with authorization requirement

**Solution**:
OPTIONS methods must have authorization set to NONE:

```bash
aws apigateway update-method \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS \
  --patch-operations op=replace,path=/authorizationType,value=NONE
```

### Issue 4: Cached CORS Errors in Browser

**Symptoms**:
- CORS errors persist even after fixing API Gateway configuration
- curl tests work but browser still shows errors

**Root Cause**: Browser caching old responses

**Solution**:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Use hard refresh (Ctrl+Shift+R)
3. Test in incognito/private mode
4. Invalidate CloudFront cache:

```bash
aws cloudfront create-invalidation \
  --distribution-id E2YY0J2AT3CSWZ \
  --paths "/*"
```

## Testing CORS Configuration

### Using curl

Test OPTIONS preflight requests:

```bash
# Test aws-credentials endpoint
curl -X OPTIONS "https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/aws-credentials" \
  -H "Origin: https://app.twin-wicks.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v

# Expected response:
# < HTTP/2 200
# < access-control-allow-origin: *
# < access-control-allow-methods: OPTIONS,GET,POST,PUT,DELETE
# < access-control-allow-headers: Content-Type,X-Amz-Date,Authorization,...
```

### Using Browser DevTools

1. Open DevTools (F12)
2. Go to Network tab
3. Trigger the API request from the application
4. Look for the OPTIONS request (preflight)
5. Check:
   - Status should be 200
   - Response headers should include CORS headers
   - Request headers should include Origin

## API Gateway Configuration Reference

### Checking Current Configuration

```bash
# Get method configuration
aws apigateway get-method \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS

# Get integration configuration
aws apigateway get-integration \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS

# Get integration response
aws apigateway get-integration-response \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS \
  --status-code 200
```

### Creating OPTIONS Method from Scratch

```bash
# 1. Create OPTIONS method
aws apigateway put-method \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS \
  --authorization-type NONE \
  --no-api-key-required

# 2. Create MOCK integration
aws apigateway put-integration \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{statusCode:200}"}' \
  --content-handling CONVERT_TO_TEXT

# 3. Create method response
aws apigateway put-method-response \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters \
    method.response.header.Access-Control-Allow-Headers=false,\
    method.response.header.Access-Control-Allow-Methods=false,\
    method.response.header.Access-Control-Allow-Origin=false \
  --response-models '{"application/json": "Empty"}'

# 4. Create integration response
aws apigateway put-integration-response \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters \
    method.response.header.Access-Control-Allow-Headers="'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",\
    method.response.header.Access-Control-Allow-Methods="'OPTIONS,GET,POST,PUT,DELETE'",\
    method.response.header.Access-Control-Allow-Origin="'*'"

# 5. Deploy to prod
aws apigateway create-deployment \
  --rest-api-id fcnq8h7mai \
  --stage-name prod
```

## Known Working Endpoints

The following endpoints have verified working CORS configuration:

| Endpoint | Resource ID | Status |
|----------|-------------|--------|
| `/expenses` | 012161 | ✅ Working |
| `/aws-credentials` | 72a8r4 | ✅ Working |
| `/aws-cost-import` | jrlinu | ✅ Working |

## Best Practices

1. **Always use MOCK integration for OPTIONS methods** - Don't invoke Lambda for preflight requests
2. **Use JavaScript object notation in request templates** - `{statusCode:200}` not `{"statusCode": 200}`
3. **Set authorization to NONE for OPTIONS** - Preflight requests don't include credentials
4. **Deploy after making changes** - API Gateway changes don't take effect until deployed
5. **Test with curl before browser** - Eliminates caching issues during debugging
6. **Compare with working endpoints** - Use `/expenses` as a reference configuration

## Security Considerations

### Current Configuration

The current CORS configuration uses a wildcard origin (`*`), which allows requests from any domain. This is acceptable for development but should be restricted in production.

### Recommended Production Configuration

For production, restrict CORS to specific origins:

```bash
# Update integration response to use specific origin
aws apigateway put-integration-response \
  --rest-api-id fcnq8h7mai \
  --resource-id <RESOURCE_ID> \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters \
    method.response.header.Access-Control-Allow-Origin="'https://app.twin-wicks.com'"
```

**Note**: When using a specific origin, you cannot use wildcards in other CORS headers.

## Additional Resources

- [AWS API Gateway CORS Documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html)
- [MDN CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [AWS API Gateway MOCK Integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-mock-integration.html)

## Changelog

- **November 5, 2025**: Fixed CORS issues on `/aws-credentials` and `/aws-cost-import` endpoints
  - Corrected MOCK integration request template format
  - Created missing `/aws-cost-import` endpoint
  - Documented troubleshooting procedures

