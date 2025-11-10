# AWS Expenses Reimport Analysis

## Database Analysis Results

I've checked your DynamoDB table and found that **YES, you need to delete and reimport your AWS expenses**.

### Current State of AWS Expenses

Your existing AWS expenses have the **OLD field structure**:
- ✅ Has `date` field (e.g., "2025-02-28")
- ❌ Missing `transactionDate` field
- Source: `aws-auto-import`

**Example from database:**
```json
{
  "date": "2025-02-28",
  "description": "AWS EC2 - Other charges for February 2025",
  "vendor": "AWS - EC2 - Other",
  "amount": 0.96,
  "source": "aws-auto-import"
  // NO transactionDate field!
}
```

### Why Reimport is Needed

1. **Frontend expects `transactionDate`**: The frontend's `formatDate()` function looks for `transactionDate`, not `date`
2. **Your expenses will show "invalid date"**: Without `transactionDate`, the frontend can't display dates properly
3. **New Lambda uses `transactionDate`**: The updated Lambda function now saves expenses with `transactionDate` field

### What You Need to Do

**Step 1: Delete Existing AWS Expenses**
- Go to your expense tracker app
- Filter or search for AWS expenses (they have "AWS" in the description)
- Delete them manually, or I can create a script to bulk delete them

**Step 2: Reimport AWS Costs**
- Use the AWS Cost Import feature in your app
- The new Lambda function will create expenses with `transactionDate` field
- Dates will display correctly

### Alternative: Database Migration Script

Instead of deleting and reimporting, I could create a script that:
1. Scans all expenses with `source: "aws-auto-import"`
2. Copies the `date` field value to a new `transactionDate` field
3. Updates each expense in DynamoDB

This would preserve the existing data without needing to reimport.

## Recommendation

**Option A (Recommended): Delete & Reimport**
- Pros: Clean, uses the new Lambda code, guaranteed to work
- Cons: Need to manually delete or run a delete script
- Time: 5-10 minutes

**Option B: Database Migration Script**
- Pros: Preserves existing data, no need to reimport
- Cons: Requires running a migration script
- Time: 2-3 minutes to create and run script

Which option would you prefer?