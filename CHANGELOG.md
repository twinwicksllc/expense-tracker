# Changelog

All notable changes to the Expense Tracker project will be documented in this file.

## [1.1.1] - 2025-11-05

### Fixed
- **AWS Cost Import Bug**: Fixed issue where imported AWS expenses were not appearing in the Expenses tab or Dashboard
  - Added missing `uploadDate` field to expense records created by `aws-cost-import` Lambda function
  - The `getExpenses` function queries using `userId-uploadDate-index` GSI which requires this field
  - All imported expenses now include `uploadDate`, `createdAt`, and `updatedAt` timestamps
  - Updated Lambda deployment to include all required `node_modules` dependencies

## [1.1.0] - 2025-11-05

### Added - AWS Cost Tracking Feature

#### Backend
- **New DynamoDB Table**: `expense-tracker-aws-credentials` for storing encrypted user AWS credentials
- **New Lambda Function**: `aws-credentials.js` - Manages CRUD operations for AWS credentials with encryption
- **New Lambda Function**: `aws-cost-import.js` - Fetches monthly AWS costs via Cost Explorer API and creates expense entries
- **New API Endpoints**:
  - `GET /aws-credentials` - Get user's AWS credentials status
  - `POST /aws-credentials` - Save/update AWS credentials
  - `DELETE /aws-credentials` - Remove AWS credentials
  - `PUT /aws-credentials/toggle` - Enable/disable automatic imports
  - `POST /aws-cost-import` - Manually trigger cost import
- **IAM Permissions**: Added DynamoDB and Cost Explorer permissions to Lambda execution role
- **EventBridge Rule**: `expense-tracker-monthly-aws-cost-import` - Triggers monthly cost imports on the 1st at 9 AM UTC

#### Frontend
- **New Settings Page**: Complete UI for managing AWS credentials
  - Add/update AWS IAM credentials (Access Key ID, Secret Access Key, Region)
  - View credentials status (configured/enabled/disabled)
  - Enable/disable automatic monthly imports
  - Manual cost import trigger
  - IAM permissions documentation
- **New CSS File**: `settings-styles.css` - Styles for Settings page
- **New JavaScript Module**: AWS credentials management API integration
- **Updated Navigation**: Added "Settings" tab to main navigation

#### Security
- AWS Secret Access Keys encrypted using AWS Encryption SDK
- DynamoDB table encryption at rest enabled
- Secure credential storage with per-user isolation

#### Features
- Automatic monthly AWS cost imports on the 1st of each month
- Manual cost import capability for previous month
- Per-service cost breakdown (Lambda, S3, CloudFront, etc.)
- Multi-user support with isolated credentials
- Enable/disable toggle for automatic imports

### Changed
- Updated `lambda/package.json` to include AWS SDK Cost Explorer client
- Modified frontend navigation to include Settings tab
- Enhanced API Gateway with new credential management endpoints

### Technical Details
- **Encryption**: Application-level encryption using crypto module with AES-256-GCM
- **Cost Data**: Retrieved from AWS Cost Explorer API for previous month
- **Expense Creation**: Automatic expense entries with vendor "AWS - [Service Name]"
- **Category**: All AWS costs categorized as "Software"
- **Schedule**: Cron expression `cron(0 9 1 * ? *)` for monthly execution

### Deployment Notes
- Frontend files deployed to S3: `index.html`, `app.js`, `settings-styles.css`
- Lambda functions deployed with dependencies
- CloudFront cache invalidated for updated files
- EventBridge rule requires manual setup via AWS CloudShell (see documentation)

### Documentation Added
- `aws-cost-tracking-implementation-summary.md` - Complete implementation overview
- `cloudshell-setup-instructions.md` - Step-by-step EventBridge setup guide
- `eventbridge-setup-cloudshell.sh` - Automated setup script
- `quick-fix-commands.md` - Troubleshooting guide

## [1.0.0] - 2025-10-19

### Initial Release
- Basic expense tracking functionality
- Project management
- Receipt upload with AI parsing
- Dashboard with expense analytics
- Cognito authentication
- DynamoDB backend
- S3 + CloudFront hosting

