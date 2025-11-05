# Changelog

All notable changes to the Expense Tracker project will be documented in this file.

## [1.2.2] - 2025-11-05

### Fixed
- **Zero-Cost Services Filter**: Fixed issue where $0.00 AWS services were being imported
  - Now filters out services with exactly $0.00 cost
  - Still imports small legitimate charges (≥$0.01)
  - Deleted 22 existing zero-cost expenses from database
  - Services like Tax, CloudWatch, Textract with $0.00 will no longer be imported

### Changed
- Updated filter logic to skip amounts that are 0 or less than $0.01
- Improved logging to show "zero or negligible cost" for skipped services

### Technical Details
- Filter condition: `if (amount === 0 || amount < 0.01)`
- Keeps legitimate small charges like $0.01 (Others), $0.02 (DynamoDB), etc.
- Excludes free-tier services and services not actually used

## [1.2.1] - 2025-11-05 (REVERTED)

### Changed
- ~~Removed Minimum Threshold~~ (This was incorrect - imported too many $0.00 services)
- Reverted in v1.2.2 with proper zero-cost filtering

## [1.2.0] - 2025-11-05

### Added
- **Multi-Month Import**: Users can now import AWS costs for 1, 2, 3, 6, or 12 months at once
- **Duplicate Detection**: Automatic detection and skipping of duplicate expenses during import
- **Expanded Region Support**: Added all AWS regions (32 total) to the region dropdown, organized by geographic area
  - North America: 8 regions
  - South America: 1 region
  - Europe: 8 regions
  - Middle East: 3 regions
  - Africa: 1 region
  - Asia Pacific: 11 regions
- **Enhanced Import Feedback**: Import results now show number of duplicates skipped and expenses below minimum threshold

### Changed
- Updated `aws-cost-import` Lambda function to accept `months` parameter in request body
- Modified frontend to include month selector dropdown in AWS Cost Tracking settings
- Improved import confirmation messages with detailed statistics (expenses created, duplicates skipped, total amount)
- Updated region dropdown from 4 regions to 32 regions for better user experience

### Technical Details
- Lambda function now loops through multiple months when importing costs
- Each expense is checked against existing DynamoDB records before creation using `expenseExists()` function
- Duplicate detection uses userId, vendor, amount, and date as matching criteria
- Import response includes: `monthsProcessed`, `expensesCreated`, `duplicatesSkipped`, `belowMinimumSkipped`, `totalAmount`
- DynamoDB Scan operation used for duplicate detection (optimized for accuracy over speed)

### Documentation
- Added `docs/MULTI_MONTH_IMPORT.md` - Comprehensive guide for multi-month import feature

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

