# Expense Tracker - Freelancer Edition

A full-stack expense tracking application with AI-powered receipt parsing and project-based expense organization.

## Overview

This application helps freelancers and small businesses track expenses, parse receipts using AI, and organize expenses by project. Built with a serverless architecture on AWS.

## Architecture

- **Frontend**: Vanilla JavaScript SPA hosted on S3 + CloudFront
- **Backend**: AWS Lambda functions (Node.js 22)
- **Database**: DynamoDB
- **Authentication**: AWS Cognito
- **API**: API Gateway with Cognito authorizer
- **Storage**: S3 for receipt storage

## Repository Structure

```
expense-tracker-repo/
├── frontend/           # Frontend application files
│   ├── index.html     # Main HTML file with inline CSS
│   └── app.js         # JavaScript application code
├── lambda/            # AWS Lambda functions
│   ├── projects.js    # Project management Lambda
│   ├── expenses.js    # Expense management Lambda
│   └── package.json   # Lambda dependencies
├── docs/              # Documentation
│   ├── deployment_summary.md
│   └── project_tracking_test_report.md
└── README.md          # This file
```

## Features

### Implemented ✅
- User authentication (Cognito)
- Expense CRUD operations
- Receipt upload and storage
- AI-powered receipt parsing
- Dashboard with expense summaries
- Category-based expense tracking
- Project management (CRUD)
- Expense-to-project assignment
- Project expense totals calculation
- AWS credentials management with encryption
- Automatic AWS cost import (monthly)
- Manual AWS cost import

### In Progress ⚠️
- Frontend event listeners for Save/Delete buttons
- Expense filtering by project
- Project editing UI

## AWS Resources

### DynamoDB Tables
- `expense-tracker-transactions-prod` - Stores expense transactions
- `expense-tracker-projects-prod` - Stores project information

### Lambda Functions
- `expense-tracker-prod-projects` - Project management
- `expense-tracker-prod-updateExpense` - Expense updates
- `expense-tracker-prod-getExpenses` - Expense retrieval
- `expense-tracker-prod-createExpense` - Expense creation
- `expense-tracker-prod-deleteExpense` - Expense deletion
- `expense-tracker-prod-getDashboard` - Dashboard data
- `expense-tracker-prod-parseReceipt` - AI receipt parsing
- `expense-tracker-prod-aws-credentials` - AWS credentials management
- `expense-tracker-prod-aws-cost-import` - AWS cost import automation

### API Gateway
- **API ID**: fcnq8h7mai
- **Region**: us-east-1
- **Endpoints**:
  - GET/POST `/projects`
  - GET/PUT/DELETE `/projects/{id}`
  - GET/POST `/expenses`
  - GET/PUT/DELETE `/expenses/{id}`
  - GET `/dashboard`
  - POST `/parse-receipt`
  - GET/POST/DELETE `/aws-credentials` - AWS credentials management
  - POST `/aws-cost-import` - Manual cost import trigger

**CORS Configuration**: All endpoints properly configured with CORS headers for `app.twin-wicks.com` origin. OPTIONS methods use MOCK integration with JavaScript object notation template `{statusCode:200}` for reliable preflight handling.

### S3 Buckets
- `twin-wicks.com` - Frontend hosting
- Receipts bucket (configured in Lambda environment)

### CloudFront Distribution
- **Distribution ID**: EB9MXBNYV9HVD
- **Domain**: app.twin-wicks.com

## Environment Variables

### Lambda Functions

#### projects.js
```
PROJECTS_TABLE=expense-tracker-projects-prod
TRANSACTIONS_TABLE=expense-tracker-transactions-prod
```

#### expenses.js
```
TRANSACTIONS_TABLE=expense-tracker-transactions-prod
RECEIPTS_BUCKET=<receipts-bucket-name>
```

## Deployment

### Frontend Deployment

```bash
# Upload to S3
aws s3 cp frontend/index.html s3://twin-wicks.com/index.html --content-type "text/html"
aws s3 cp frontend/app.js s3://twin-wicks.com/app.js --content-type "application/javascript"

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id EB9MXBNYV9HVD \
  --paths "/*"
```

### Lambda Deployment

```bash
cd lambda

# Install dependencies
npm install

# Deploy projects Lambda
zip -r projects.zip projects.js node_modules
aws lambda update-function-code \
  --function-name expense-tracker-prod-projects \
  --zip-file fileb://projects.zip

# Deploy expenses Lambda
zip -r expenses.zip expenses.js node_modules
aws lambda update-function-code \
  --function-name expense-tracker-prod-updateExpense \
  --zip-file fileb://expenses.zip
```

## IAM Permissions

### Lambda Execution Role

The Lambda functions require the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/expense-tracker-transactions-prod",
        "arn:aws:dynamodb:us-east-1:*:table/expense-tracker-projects-prod"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::*-receipts/*"
    }
  ]
}
```

## API Examples

### Create a Project

```bash
curl -X POST https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/projects \
  -H "Authorization: Bearer <cognito-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Website Redesign",
    "description": "Complete website overhaul"
  }'
```

### Get All Projects

```bash
curl https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/projects \
  -H "Authorization: Bearer <cognito-token>"
```

### Assign Expense to Project

```bash
curl -X PUT https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/expenses/{expense-id} \
  -H "Authorization: Bearer <cognito-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-uuid-here",
    "vendor": "Example Vendor",
    "amount": 150.00,
    "date": "2025-10-19",
    "category": "Software"
  }'
```

## Known Issues

1. **Frontend Event Listeners** - Save/Delete buttons in modals don't trigger API calls
   - Workaround: Use browser console to make direct API calls
   
2. **Expense Filtering** - Project filter dropdown doesn't filter expenses
   - Backend supports filtering, frontend implementation incomplete

3. **CloudFront Caching** - Changes may take 15-30 minutes to propagate
   - Use cache invalidation after deployments

## Development

### Local Testing

The frontend can be tested locally by:
1. Opening `frontend/index.html` in a browser
2. Updating `CONFIG.API_BASE_URL` in `app.js` to point to your API
3. Configuring Cognito settings in `CONFIG.COGNITO`

### Lambda Testing

Test Lambda functions locally using AWS SAM:

```bash
sam local invoke expense-tracker-prod-projects \
  --event test-events/get-projects.json
```

## Security

- All API endpoints protected by Cognito authorizer
- CORS configured for app.twin-wicks.com origin
- Sensitive data encrypted at rest in DynamoDB
- S3 buckets configured with appropriate access policies

## Monitoring

- CloudWatch Logs: `/aws/lambda/expense-tracker-prod-*`
- CloudWatch Metrics: Lambda invocations, errors, duration
- API Gateway metrics: Request count, latency, errors

## Support

For issues or questions:
- Check CloudWatch logs for Lambda errors
- Review API Gateway execution logs
- Verify Cognito token validity
- Ensure CORS headers are present in responses

## License

Proprietary - Twin Wicks Digital Solutions

## Version History

- **v1.0** (Oct 2025) - Initial release with basic expense tracking
- **v1.1** (Oct 2025) - Added project tracking feature
  - Project CRUD operations
  - Expense-to-project assignment
  - Project expense totals calculation
  - Known issues with frontend event listeners
- **v1.2** (Nov 2025) - Added AWS cost tracking integration
  - AWS credentials management with AES-256 encryption
  - Automatic monthly AWS cost import via EventBridge
  - Manual cost import capability
  - Settings page for credential configuration
  - Fixed CORS issues on all API endpoints
  - Proper MOCK integration configuration for OPTIONS methods

## Contributors

- Twin Wicks Digital Solutions Team
- Manus AI Assistant (Testing & Deployment)

