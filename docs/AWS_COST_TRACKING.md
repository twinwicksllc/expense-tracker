# AWS Cost Tracking Feature Documentation

## Overview

The AWS Cost Tracking feature enables users to automatically import their monthly AWS costs as expenses in the expense tracker application. This feature provides secure credential storage, automated monthly imports, and manual import capabilities.

## Architecture

The feature consists of four main components that work together to provide seamless AWS cost tracking functionality.

### Components

**Frontend Settings Page** - The user interface allows users to manage their AWS credentials through a dedicated Settings page accessible from the main navigation. Users can add, update, or remove their AWS IAM credentials, enable or disable automatic imports, and manually trigger cost imports for the previous month.

**AWS Credentials Lambda** - This Lambda function handles all CRUD operations for user AWS credentials. It encrypts secret access keys using the AWS Encryption SDK before storing them in DynamoDB, ensuring that sensitive credentials are protected both at rest and in transit.

**AWS Cost Import Lambda** - This function retrieves cost data from the AWS Cost Explorer API for all users who have configured credentials and enabled automatic imports. It fetches costs for the previous month, breaks them down by service, and creates individual expense entries in the transactions table.

**EventBridge Scheduler** - An EventBridge rule triggers the cost import Lambda function on the 1st of each month at 9 AM UTC, ensuring that AWS costs are automatically imported without user intervention.

## Database Schema

### expense-tracker-aws-credentials Table

| Field | Type | Description |
|-------|------|-------------|
| userId | String (PK) | Cognito user ID |
| accessKeyId | String | AWS IAM Access Key ID |
| encryptedSecretKey | String | Encrypted AWS Secret Access Key |
| region | String | AWS region for Cost Explorer API |
| enabled | Boolean | Whether automatic imports are enabled |
| createdAt | String | ISO timestamp of credential creation |
| updatedAt | String | ISO timestamp of last update |

## API Endpoints

### GET /aws-credentials

Retrieves the status of the user's AWS credentials without exposing sensitive data.

**Authentication**: Required (Cognito JWT)

**Response**:
```json
{
  "configured": true,
  "enabled": true,
  "region": "us-east-1",
  "updatedAt": "2025-11-05T10:30:00Z"
}
```

### POST /aws-credentials

Saves or updates the user's AWS credentials with encryption.

**Authentication**: Required (Cognito JWT)

**Request Body**:
```json
{
  "accessKeyId": "AKIA...",
  "secretAccessKey": "...",
  "region": "us-east-1",
  "enabled": true
}
```

**Response**:
```json
{
  "message": "Credentials saved successfully",
  "enabled": true
}
```

### DELETE /aws-credentials

Removes the user's AWS credentials from the system.

**Authentication**: Required (Cognito JWT)

**Response**:
```json
{
  "message": "Credentials deleted successfully"
}
```

### PUT /aws-credentials/toggle

Enables or disables automatic cost imports without modifying credentials.

**Authentication**: Required (Cognito JWT)

**Request Body**:
```json
{
  "enabled": false
}
```

### POST /aws-cost-import

Manually triggers a cost import for all users with configured credentials.

**Authentication**: Required (Cognito JWT)

**Response**:
```json
{
  "results": [
    {
      "userId": "user123",
      "status": "success",
      "expensesCreated": 5,
      "totalAmount": 123.45
    }
  ]
}
```

## Security

### Credential Encryption

AWS Secret Access Keys are encrypted using AES-256-GCM encryption before being stored in DynamoDB. The encryption key is derived from a secure random value and stored as an environment variable in the Lambda function. This ensures that even if the database is compromised, the credentials cannot be decrypted without access to the encryption key.

### IAM Permissions Required

Users must create an IAM user with the following permissions to use the AWS cost tracking feature:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "ce:GetCostForecast"
      ],
      "Resource": "*"
    }
  ]
}
```

The `ce:GetCostAndUsage` permission is required for retrieving historical cost data, while `ce:GetCostForecast` is optional and enables cost forecasting features.

## Usage

### Adding AWS Credentials

Users can add their AWS credentials by navigating to the Settings page and clicking the "Add AWS Credentials" button. They must provide a valid AWS IAM Access Key ID and Secret Access Key with Cost Explorer read permissions. The system validates the credentials and encrypts the secret key before storing it securely.

### Automatic Monthly Imports

Once credentials are configured and enabled, the system automatically imports AWS costs on the 1st of each month at 9 AM UTC. The import process retrieves cost data for the previous month and creates individual expense entries for each AWS service that incurred costs.

### Manual Import

Users can manually trigger a cost import at any time by clicking the "Import Costs Now" button in the Settings page. This is useful for testing the integration or importing costs outside of the regular schedule.

### Expense Details

Each imported expense includes the following information:

- **Vendor**: "AWS - [Service Name]" (e.g., "AWS - Lambda", "AWS - S3")
- **Amount**: Cost in USD for the previous month
- **Date**: Last day of the previous month
- **Category**: "Software"
- **Description**: "AWS [Service Name] charges for [Month Year]"

## Troubleshooting

### Credentials Not Saving

If credentials fail to save, verify that the Access Key ID and Secret Access Key are correct and that the IAM user has the required Cost Explorer permissions. Check the CloudWatch logs for the `aws-credentials` Lambda function for detailed error messages.

### Import Failing

If the cost import fails, ensure that the AWS credentials are valid and have not expired. Verify that the Cost Explorer API is accessible from the Lambda function's VPC (if applicable). Check the CloudWatch logs for the `aws-cost-import` Lambda function for specific error details.

### No Expenses Created

If the import succeeds but no expenses are created, this may indicate that there were no AWS costs for the previous month, or that the costs were below the minimum threshold. Check the Lambda function logs to see the cost data retrieved from the Cost Explorer API.

## Maintenance

### Updating Credentials

Users can update their AWS credentials at any time by clicking the "Update Credentials" button in the Settings page. The system will re-encrypt the new secret key and update the stored credentials.

### Disabling Automatic Imports

Users can disable automatic imports without removing their credentials by clicking the "Disable" button. This is useful for temporarily pausing imports without losing the configured credentials.

### Removing Credentials

Users can completely remove their AWS credentials by clicking the "Remove" button. This action deletes all stored credential data and disables automatic imports.

## Cost Considerations

The AWS Cost Tracking feature incurs minimal costs:

- **Lambda Invocations**: ~1 invocation per user per month (automatic) + manual invocations
- **DynamoDB**: Minimal storage for credentials (~1 KB per user)
- **Cost Explorer API**: $0.01 per request (1 request per user per month)

For most users, the total monthly cost is less than $0.10.

