# Monthly Chart Date Field Fix

**Date**: November 9, 2025  
**Issue**: November expenses not showing in Monthly Spending Trends chart  
**Status**: ✅ Fixed and Deployed

## Problem

The Monthly Spending Trends chart on the dashboard was not displaying current month expenses (November 2025). When a new expense was added with a November date, it appeared in the "THIS MONTH" stat card ($10.00) but did not show as a bar in the monthly chart.

## Root Cause

The dashboard Lambda function (`lambda/dashboard.js`) was using inconsistent date field names:

- **Storage**: Expenses are stored with `transactionDate` field (line 166)
- **Retrieval**: Dashboard was reading from `exp.date` field (lines 830, 835, 848, 911)

This mismatch caused the date parsing to fail, resulting in:
- `new Date(undefined)` → Invalid Date
- Expenses not being included in monthly breakdown
- Empty chart for current month

## Solution

Updated all date field references in `lambda/dashboard.js` to use a fallback pattern:

```javascript
// Before
const expDate = new Date(exp.date);

// After
const expDate = new Date(exp.transactionDate || exp.date);
```

This change was applied to 4 locations:
1. **Line 830**: Period expense filtering
2. **Line 835**: Comparison expense filtering  
3. **Line 848**: Monthly data grouping
4. **Line 911**: Current month total calculation

## Backward Compatibility

The fallback pattern `exp.transactionDate || exp.date` ensures:
- ✅ New expenses with `transactionDate` work correctly
- ✅ Legacy expenses with `date` field continue to work
- ✅ All timeframes (MTD, YTD, 6M, 12M) remain functional

## Testing

### Before Fix
- Dashboard showed "THIS MONTH: $10.00" ✅
- Monthly chart was blank ❌
- Console showed CORS errors (unrelated) ⚠️

### After Fix
- Dashboard shows "THIS MONTH: $10.00" ✅
- Monthly chart displays "Nov 2025" bar with $10 ✅
- Chart legend shows "GitHub" ✅
- Y-axis scales correctly ($0-$10) ✅

## Deployment

1. **Lambda Function**: `expense-tracker-prod-getDashboard`
2. **Deployment Method**: ZIP upload with node_modules
3. **Code Size**: 6.9 MB
4. **Runtime**: Node.js 20.x
5. **Deployed**: November 10, 2025 02:23 UTC

```bash
cd /home/ubuntu/expense-tracker/lambda
zip -r dashboard.zip dashboard.js node_modules/
aws lambda update-function-code \
  --function-name expense-tracker-prod-getDashboard \
  --zip-file fileb://dashboard.zip \
  --region us-east-1
```

## Related Files

- `lambda/dashboard.js` - Fixed date field references
- `lambda/getMonthlyChart.js` - Already used fallback pattern ✅
- `lambda/getProjectBreakdown.js` - Already used fallback pattern ✅

## Git Commit

**Commit**: `7b39f54`  
**Message**: "Fix: Use transactionDate field for monthly chart filtering"

## Verification Steps

1. Log into expense tracker at https://app.twin-wicks.com
2. Navigate to Dashboard
3. Verify "Month to Date" is selected
4. Scroll to "Monthly Spending Trends" section
5. Confirm current month bar appears in chart
6. Test other timeframes (YTD, 6M, 12M) to ensure no regression

## Future Considerations

- Consider standardizing on `transactionDate` across all Lambda functions
- Add data migration script to rename `date` → `transactionDate` in DynamoDB
- Update API documentation to specify `transactionDate` as the canonical field name
- Add automated tests for date field handling

## Related Issues

- ✅ AWS Manual Import Feature (v1.7.1)
- ✅ Monthly Chart Date Field Fix (v1.7.2)
