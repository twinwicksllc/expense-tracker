# AWS Cost Import - Manual Trigger Feature

## Issue
The AWS cost import Lambda function existed but there was no UI button for users to manually trigger imports. Users could only wait for scheduled imports.

## Root Cause
1. The settings page lacked a manual import button in the AWS credentials section
2. The `/aws-cost-import` API Gateway endpoint was missing a Cognito authorizer, preventing user identification

## Solution

### Frontend Changes
**File: `frontend/settings.js`**

1. **Added Import Button to UI**
   - Added "Import Now" button to the AWS credentials status display
   - Button appears alongside "Update Credentials" and "Delete Credentials" buttons
   - Only visible when AWS credentials are configured

2. **Created `triggerAWSImport()` Function**
   - Calls the `/aws-cost-import` POST endpoint
   - Displays loading state during import ("Importing...")
   - Shows detailed feedback including:
     - Number of expenses imported
     - Number of duplicates skipped
     - Number of zero-cost items skipped
     - Total amount imported
   - Handles error cases with user-friendly messages

3. **Button State Management**
   - Disables button during import to prevent duplicate requests
   - Restores button state after completion or error

### Backend Changes
**API Gateway Configuration**

1. **Added Cognito Authorizer**
   - Configured `/aws-cost-import` POST method to use Cognito User Pools authorizer
   - Authorizer ID: `loh0jq` (same as other protected endpoints)
   - This allows the Lambda function to extract `userId` from `event.requestContext.authorizer.claims.sub`

2. **Deployed Changes**
   - Created new API Gateway deployment to prod stage
   - Changes are immediately active

## Lambda Function Behavior

The `aws-cost-import.js` Lambda function supports multiple trigger modes:

1. **Manual Trigger (API Gateway with Authorizer)** - NEW
   - Extracts userId from JWT token via authorizer
   - Imports costs only for the authenticated user
   - Returns detailed results for that user

2. **Scheduled Trigger (EventBridge)**
   - Scans all users with AWS credentials enabled
   - Imports costs for all users automatically

3. **Manual Trigger (API Gateway without Authorizer)** - Legacy
   - Imports for all users with credentials
   - Not used in current implementation

## Response Format

The Lambda function returns a summary object:

```json
{
  "totalUsers": 1,
  "successful": 1,
  "skipped": 0,
  "errors": 0,
  "results": [
    {
      "userId": "user-id-here",
      "status": "success",
      "monthsProcessed": 1,
      "expensesCreated": 5,
      "duplicatesSkipped": 2,
      "belowMinimumSkipped": 3,
      "totalAmount": "123.45"
    }
  ]
}
```

## User Experience

1. User navigates to Settings → AWS Integration tab
2. If AWS credentials are configured, they see:
   - AWS Account Connected status
   - Access Key and Region information
   - **Import Now** button (new)
   - Update Credentials button
   - Delete Credentials button
3. User clicks "Import Now"
4. Button changes to "Importing..." and becomes disabled
5. After completion, user sees detailed feedback:
   - "Import successful! 5 expenses imported (2 duplicates skipped, 3 zero-cost items skipped). Total: $123.45"
6. Button returns to normal state

## Testing Checklist

- [x] Button appears when AWS credentials are configured
- [x] Button is hidden when no AWS credentials exist
- [x] Button shows loading state during import
- [x] Detailed feedback is displayed after import
- [x] Error messages are user-friendly
- [x] API Gateway authorizer extracts correct userId
- [x] Lambda function processes only the authenticated user's credentials
- [x] Duplicate detection works correctly
- [x] Zero-cost items are skipped

## Deployment

### Frontend
```bash
aws s3 cp frontend/settings.js s3://expense-tracker-frontend-391907191624/ --content-type "application/javascript"
aws cloudfront create-invalidation --distribution-id EB9MXBNYV9HVD --paths "/settings.js"
```

### API Gateway
```bash
# Add Cognito authorizer to POST method
aws apigateway update-method --rest-api-id fcnq8h7mai --resource-id jrlinu --http-method POST \
  --patch-operations op=replace,path=/authorizationType,value=COGNITO_USER_POOLS \
                       op=replace,path=/authorizerId,value=loh0jq \
  --region us-east-1

# Deploy to prod stage
aws apigateway create-deployment --rest-api-id fcnq8h7mai --stage-name prod --region us-east-1 \
  --description "Add Cognito authorizer to aws-cost-import endpoint"
```

## Security Considerations

1. **Authentication Required**: The endpoint now requires a valid Cognito JWT token
2. **User Isolation**: Each user can only trigger imports for their own account
3. **Rate Limiting**: Button is disabled during import to prevent spam
4. **Credential Security**: AWS credentials are encrypted at rest in DynamoDB
5. **CORS**: Properly configured for app.twin-wicks.com origin

## Future Enhancements

1. Add ability to specify number of months to import (currently defaults to 1)
2. Add progress indicator for long-running imports
3. Add import history/log viewer
4. Add email notifications for scheduled imports
5. Add ability to schedule custom import times

## Related Files

- `frontend/settings.js` - Frontend implementation
- `frontend/settings.html` - Settings page UI
- `lambda/aws-cost-import.js` - Lambda function for importing costs
- `lambda/aws-credentials.js` - Lambda function for managing credentials

## Commit

```
commit 71c3353
Author: Manus AI
Date: Nov 9, 2025

Add manual AWS cost import button to settings page

- Added 'Import Now' button to AWS credentials status display
- Created triggerAWSImport() function to call /aws-cost-import endpoint
- Added detailed feedback showing imported expenses, duplicates, and total amount
- Fixed missing Cognito authorizer on /aws-cost-import API Gateway endpoint
- Button shows loading state during import process

This allows users to manually trigger AWS cost imports instead of waiting for scheduled imports.
```

## Version

This fix is part of version **1.7.1** of the expense tracker application.
