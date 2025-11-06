# Multi-Month AWS Cost Import Feature

## Overview

The expense tracker now supports importing AWS costs for multiple months at once, with automatic duplicate detection to prevent double-counting expenses.

## Features

### 1. Expanded Region Support

The AWS region dropdown now includes **all AWS regions** organized by geographic area:

**North America (8 regions)**
- US East (N. Virginia) - us-east-1
- US East (Ohio) - us-east-2
- US West (N. California) - us-west-1
- US West (Oregon) - us-west-2
- Canada (Central) - ca-central-1
- Canada West (Calgary) - ca-west-1
- AWS GovCloud (US-East) - us-gov-east-1
- AWS GovCloud (US-West) - us-gov-west-1

**South America (1 region)**
- South America (São Paulo) - sa-east-1

**Europe (8 regions)**
- Europe (Frankfurt) - eu-central-1
- Europe (Ireland) - eu-west-1
- Europe (London) - eu-west-2
- Europe (Paris) - eu-west-3
- Europe (Milan) - eu-south-1
- Europe (Stockholm) - eu-north-1
- Europe (Spain) - eu-south-2
- Europe (Zurich) - eu-central-2

**Middle East (3 regions)**
- Middle East (Bahrain) - me-south-1
- Middle East (UAE) - me-central-1
- Middle East (Tel Aviv) - il-central-1

**Africa (1 region)**
- Africa (Cape Town) - af-south-1

**Asia Pacific (11 regions)**
- Asia Pacific (Tokyo) - ap-northeast-1
- Asia Pacific (Seoul) - ap-northeast-2
- Asia Pacific (Singapore) - ap-southeast-1
- Asia Pacific (Sydney) - ap-southeast-2
- Asia Pacific (Mumbai) - ap-south-1
- Asia Pacific (Osaka) - ap-northeast-3
- Asia Pacific (Hong Kong) - ap-east-1
- Asia Pacific (Jakarta) - ap-southeast-3
- Asia Pacific (Melbourne) - ap-southeast-4
- Asia Pacific (Hyderabad) - ap-south-2
- Asia Pacific (Malaysia) - ap-southeast-5

**Note:** AWS Cost Explorer is a global service, so the region selection is primarily for user convenience and doesn't affect cost data retrieval.

### 2. Multi-Month Import

Users can now import AWS costs for multiple months in a single operation:

**Available Options:**
- Last 1 month (default)
- Last 2 months
- Last 3 months
- Last 6 months
- Last 12 months

**How It Works:**
1. Navigate to Settings → AWS Cost Tracking
2. Select the number of months from the dropdown
3. Click "Import AWS Costs"
4. The system will fetch and import costs for each month sequentially

### 3. Automatic Duplicate Detection

The system automatically prevents duplicate expenses from being created:

**Detection Logic:**
- Checks for existing expenses with the same:
  - User ID
  - Vendor name
  - Amount
  - Date

**Benefits:**
- Safe to re-run imports without creating duplicates
- Can import overlapping date ranges without double-counting
- Provides feedback on how many duplicates were skipped

## Technical Implementation

### Frontend Changes

**File:** `app.js`

1. **Month Selector UI**
```javascript
<div class="form-group" style="margin-bottom: 10px;">
    <label for="import-months">Number of Months to Import</label>
    <select id="import-months" class="import-month-select">
        <option value="1">Last 1 month</option>
        <option value="2">Last 2 months</option>
        <option value="3">Last 3 months</option>
        <option value="6">Last 6 months</option>
        <option value="12">Last 12 months</option>
    </select>
</div>
```

2. **API Call with Months Parameter**
```javascript
async importCosts(months = 1) {
    const response = await fetch(`${CONFIG.API_BASE_URL}/aws-cost-import`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('idToken')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ months })
    });
    if (!response.ok) throw new Error('Failed to import costs');
    return response.json();
}
```

3. **Enhanced Success Message**
```javascript
let message = `Successfully imported ${userResult.expensesCreated} expenses totaling $${userResult.totalAmount}`;
if (userResult.duplicatesSkipped > 0) {
    message += `\n${userResult.duplicatesSkipped} duplicate(s) skipped`;
}
if (userResult.belowMinimumSkipped > 0) {
    message += `\n${userResult.belowMinimumSkipped} below minimum threshold`;
}
```

### Backend Changes

**File:** `lambda/aws-cost-import.js`

1. **Duplicate Detection Function**
```javascript
async function expenseExists(userId, vendor, amount, date) {
    const result = await docClient.send(new ScanCommand({
        TableName: TRANSACTIONS_TABLE,
        FilterExpression: 'userId = :userId AND vendor = :vendor AND amount = :amount AND #date = :date',
        ExpressionAttributeNames: {
            '#date': 'date'
        },
        ExpressionAttributeValues: {
            ':userId': userId,
            ':vendor': vendor,
            ':amount': amount,
            ':date': date
        }
    }));
    
    return result.Items && result.Items.length > 0;
}
```

2. **Multi-Month Loop**
```javascript
for (let monthOffset = 1; monthOffset <= months; monthOffset++) {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const targetMonthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0);
    
    const startDate = targetMonth.toISOString().split('T')[0];
    const endDate = targetMonthEnd.toISOString().split('T')[0];
    
    // Fetch and process costs for this month
    // ...
}
```

3. **Enhanced Response**
```javascript
return {
    userId,
    status: 'success',
    monthsProcessed: months,
    expensesCreated: allExpenses.length,
    duplicatesSkipped: totalDuplicates,
    belowMinimumSkipped: totalSkipped,
    totalAmount: totalCost.toFixed(2)
};
```

## Usage Examples

### Example 1: Initial Import (3 months)

1. Select "Last 3 months" from dropdown
2. Click "Import AWS Costs"
3. System imports October, September, and August costs
4. Result: "Successfully imported 15 expenses totaling $125.43"

### Example 2: Re-running Import (with duplicates)

1. Select "Last 2 months" from dropdown
2. Click "Import AWS Costs"
3. System detects existing October expenses
4. Result: "Successfully imported 5 expenses totaling $42.18\n10 duplicate(s) skipped"

### Example 3: Catching Up After Missed Months

1. Select "Last 6 months" from dropdown
2. Click "Import AWS Costs"
3. System imports all months, skipping any that already exist
4. Result: "Successfully imported 45 expenses totaling $523.67\n15 duplicate(s) skipped"

## Performance Considerations

- **API Calls:** One Cost Explorer API call per month
- **DynamoDB Scans:** One scan per expense for duplicate detection
- **Lambda Timeout:** Set to 300 seconds (5 minutes) to handle 12-month imports
- **Memory:** 512 MB allocation is sufficient

**Estimated Processing Time:**
- 1 month: ~5-10 seconds
- 3 months: ~15-30 seconds
- 6 months: ~30-60 seconds
- 12 months: ~60-120 seconds

## Cost Implications

**AWS Cost Explorer API:**
- $0.01 per API request
- 1 month import = 1 request = $0.01
- 12 month import = 12 requests = $0.12

**DynamoDB:**
- Duplicate detection uses Scan operations
- Cost depends on table size and number of expenses
- Typical cost: $0.001-0.01 per import

## Troubleshooting

### Issue: Expenses Not Appearing

**Cause:** Missing `uploadDate` field (fixed in v1.1.1)

**Solution:** Already fixed in current version. If using older version, update Lambda function.

### Issue: Duplicate Detection Not Working

**Symptoms:** Same expenses imported multiple times

**Possible Causes:**
1. Amount rounding differences
2. Vendor name variations
3. Date format mismatches

**Solution:** Check CloudWatch logs for duplicate detection messages

### Issue: Import Timeout

**Symptoms:** 502 error when importing 12 months

**Solution:** Lambda timeout is set to 300 seconds. If still timing out, reduce number of months or contact support.

## Future Enhancements

Potential improvements for future versions:

1. **Date Range Selector:** Allow custom start/end dates instead of fixed month counts
2. **Selective Import:** Choose specific AWS services to import
3. **Cost Allocation Tags:** Support for AWS cost allocation tags
4. **Scheduled Imports:** Automatic monthly imports via EventBridge
5. **Import History:** Track when imports were run and what was imported
6. **Batch Duplicate Detection:** Optimize duplicate checking with batch queries

## Version History

- **v1.2.0** (2025-11-05): Added multi-month import and expanded region support
- **v1.1.1** (2025-11-05): Fixed missing uploadDate field bug
- **v1.1.0** (2025-10-XX): Initial AWS Cost Explorer integration
- **v1.0.0** (2025-XX-XX): Initial expense tracker release

## Related Documentation

- [AWS Cost Tracking Setup](./AWS_COST_TRACKING.md)
- [API Reference](./API_REFERENCE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)

