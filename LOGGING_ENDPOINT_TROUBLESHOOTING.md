# Logging Endpoint Troubleshooting Report

## Current Error
Frontend is getting CORS errors when trying to POST logs to the `/logs` endpoint:

```
Access to fetch at 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/logs' 
from origin 'https://teckstart.com' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.

POST https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/logs net::ERR_FAILED
```

## What Was Completed

### 1. Lambda Function Created ✅
- **Function Name**: `expense-tracker-prod-logs`
- **Runtime**: Node.js 22
- **Handler**: `logs.handler`
- **Location**: `/workspaces/expense-tracker/lambda/logs.js`
- **Status**: Function exists and works when tested directly

**Direct Lambda Test Result** (successful):
```json
{
  "statusCode": 200,
  "headers": {
    "Access-Control-Allow-Origin": "https://teckstart.com",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
  },
  "body": ""
}
```

### 2. API Gateway Configuration ✅
- **Resource**: `/logs` (Resource ID: m1tz49)
- **POST Method**: Configured with Cognito authorizer (6d5roa)
- **OPTIONS Method**: Configured with NONE authorization
- **Integration**: AWS_PROXY to Lambda function
- **Permissions**: Lambda invoke permissions added for both POST and OPTIONS

### 3. IAM Permissions Added ✅
- Attached `AWSLambdaBasicExecutionRole` to Lambda role
- Added custom CloudWatch Logs policy for log group `/aws/lambda/expense-tracker-frontend-logs`
- Permissions include: CreateLogGroup, CreateLogStream, PutLogEvents, DescribeLogStreams

### 4. Deployments Created ✅
- Deployment ID: `afamro` - Initial deployment with MOCK integration
- Deployment ID: `k1c0pc` - Fixed deployment with Lambda integration
- Current stage `prod` is using deployment `k1c0pc`

## Current Problem

**OPTIONS preflight requests are returning 500 Internal Server Error**

```
HTTP/2 500
content-type: application/json
x-amzn-errortype: InternalServerErrorException

{"message": "Internal server error"}
```

## What Was Tried

### Attempt 1: MOCK Integration for OPTIONS
- Created MOCK integration with static CORS headers
- Added method responses and integration responses
- **Result**: Still returned 500 errors

### Attempt 2: Lambda Integration for OPTIONS
- Removed MOCK integration
- Configured AWS_PROXY integration to Lambda for OPTIONS
- Lambda function handles OPTIONS correctly (verified with direct test)
- **Result**: Still returning 500 errors

### Attempt 3: Multiple Deployments
- Created multiple deployments to force propagation
- Waited for CloudFront cache to clear
- **Result**: No change, still 500 errors

## Possible Root Causes

1. **CloudFront Caching**: The 500 error might be cached by CloudFront
   - Headers show: `x-cache: Error from cloudfront`
   - May need CloudFront cache invalidation

2. **API Gateway Stage Configuration**: Something in the stage settings might be interfering

3. **Lambda Function Dependencies**: The Lambda function requires `@aws-sdk/client-cloudwatch-logs` but no node_modules were packaged
   - Current deployment only includes `logs.js` file
   - Missing dependencies could cause runtime errors

4. **Log Group Doesn't Exist**: The target log group `/aws/lambda/expense-tracker-frontend-logs` was never created
   - Attempted to create but got AccessDeniedException
   - Lambda might be failing when trying to write logs

## Recommended Next Steps

### Priority 1: Fix Lambda Dependencies
```bash
cd /workspaces/expense-tracker/lambda
npm install @aws-sdk/client-cloudwatch-logs
zip -r logs.zip logs.js node_modules
aws lambda update-function-code \
  --function-name expense-tracker-prod-logs \
  --zip-file fileb://logs.zip
```

### Priority 2: Create CloudWatch Log Group
```bash
# As admin user with proper permissions:
aws logs create-log-group --log-group-name /aws/lambda/expense-tracker-frontend-logs
```

### Priority 3: Check Lambda Execution Logs
```bash
aws logs tail /aws/lambda/expense-tracker-prod-logs --follow
```

### Priority 4: Invalidate CloudFront Cache
```bash
aws cloudfront create-invalidation \
  --distribution-id EB9MXBNYV9HVD \
  --paths "/prod/logs"
```

### Priority 5: Test Directly Against API Gateway (Bypass CloudFront)
Use the API Gateway invoke URL directly instead of through CloudFront to isolate the issue.

## Files Involved

- **Lambda Function**: `/workspaces/expense-tracker/lambda/logs.js`
- **Frontend Logger**: `/workspaces/expense-tracker/teckstart-bucket/logger-1764381275.js`
- **API Gateway**: fcnq8h7mai (us-east-1)
- **Lambda Role**: expense-tracker-prod-us-east-1-lambdaRole

## Configuration Details

**Lambda Function ARN**:
```
arn:aws:lambda:us-east-1:391907191624:function:expense-tracker-prod-logs
```

**API Gateway Endpoint**:
```
https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/logs
```

**Expected CORS Headers**:
```
Access-Control-Allow-Origin: https://teckstart.com
Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With
Access-Control-Allow-Methods: POST,OPTIONS
```

## Summary

The logging endpoint infrastructure is 90% complete. The Lambda function works correctly when tested directly, but API Gateway is returning 500 errors for OPTIONS requests. The most likely cause is missing Node.js dependencies in the Lambda deployment package, preventing the function from executing properly in the API Gateway context.
