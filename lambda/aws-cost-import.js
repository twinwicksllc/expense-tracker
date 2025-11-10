const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'expense-tracker-transactions-prod';
const CREDENTIALS_TABLE = process.env.CREDENTIALS_TABLE || 'expense-tracker-aws-credentials-prod';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
// MIN_AMOUNT filter removed - import all expenses regardless of amount

// Decrypt function (same as in aws-credentials.js)
function decrypt(encryptedData) {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

// Get user's AWS credentials
async function getUserCredentials(userId) {
    const result = await docClient.send(new GetCommand({
        TableName: CREDENTIALS_TABLE,
        Key: { userId }
    }));
    
    if (!result.Item || !result.Item.enabled) {
        return null;
    }
    
    return {
        accessKeyId: decrypt(result.Item.accessKeyId),
        secretAccessKey: decrypt(result.Item.secretAccessKey),
        region: result.Item.region || 'us-east-1'
    };
}

// Check if expense already exists (duplicate detection)
async function expenseExists(userId, vendor, amount, transactionDate) {
    const result = await docClient.send(new ScanCommand({
        TableName: TRANSACTIONS_TABLE,
        FilterExpression: 'userId = :userId AND vendor = :vendor AND amount = :amount AND transactionDate = :transactionDate',
        ExpressionAttributeValues: {
            ':userId': userId,
            ':vendor': vendor,
            ':amount': amount,
            ':transactionDate': transactionDate
        }
    }));
    
    return result.Items && result.Items.length > 0;
}

// Import costs for a single user
async function importCostsForUser(userId, months = 1) {
    console.log(`Importing costs for user: ${userId} for last ${months} month(s)`);
    
    // Get user's AWS credentials
    const credentials = await getUserCredentials(userId);
    
    if (!credentials) {
        console.log(`User ${userId} has no AWS credentials configured or disabled`);
        return {
            userId,
            status: 'skipped',
            reason: 'No credentials or disabled'
        };
    }
    
    // Create Cost Explorer client with user's credentials
    const ceClient = new CostExplorerClient({
        region: 'us-east-1', // Cost Explorer is only available in us-east-1
        credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey
        }
    });
    
    try {
        const allExpenses = [];
        let totalSkipped = 0;
        let totalDuplicates = 0;
        
        // Loop through each month
        for (let monthOffset = 1; monthOffset <= months; monthOffset++) {
            const now = new Date();
            const targetMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
            const targetMonthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0);
            
            const startDate = targetMonth.toISOString().split('T')[0];
            const endDate = targetMonthEnd.toISOString().split('T')[0];
            
            console.log(`Fetching costs from ${startDate} to ${endDate}`);
            
            // Call Cost Explorer API
            const costData = await ceClient.send(new GetCostAndUsageCommand({
                TimePeriod: {
                    Start: startDate,
                    End: endDate
                },
                Granularity: 'MONTHLY',
                Metrics: ['UnblendedCost'],
                GroupBy: [
                    {
                        Type: 'DIMENSION',
                        Key: 'SERVICE'
                    }
                ]
            }));
            
            const expenses = [];
        
        // Process each service's cost
        for (const result of costData.ResultsByTime) {
            for (const group of result.Groups) {
                const serviceName = group.Keys[0];
                const amount = parseFloat(group.Metrics.UnblendedCost.Amount);
                
                // Skip if amount is exactly $0.00 (but keep small amounts like $0.01)
                if (amount === 0 || amount < 0.01) {
                    console.log(`Skipping ${serviceName}: $${amount.toFixed(2)} (zero or negligible cost)`);
                    totalSkipped++;
                    continue;
                }
                
                const vendor = `AWS - ${serviceName}`;
                const expenseAmount = parseFloat(amount.toFixed(2));
                
                // Check for duplicates
                const isDuplicate = await expenseExists(userId, vendor, expenseAmount, endDate);
                if (isDuplicate) {
                    console.log(`Skipping duplicate: ${serviceName} - $${expenseAmount} for ${endDate}`);
                    totalDuplicates++;
                    continue;
                }
                
                const transactionId = uuidv4();
                const now = new Date().toISOString();
                const expense = {
                    userId,
                    transactionId,
                    vendor,
                    amount: expenseAmount,
                    transactionDate: endDate,
                    category: 'Software',
                    description: `AWS ${serviceName} charges for ${targetMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
                    uploadDate: now,
                    createdAt: now,
                    updatedAt: now,
                    source: 'aws-auto-import'
                };
                
                // Save to DynamoDB
                await docClient.send(new PutCommand({
                    TableName: TRANSACTIONS_TABLE,
                    Item: expense
                }));
                
                expenses.push(expense);
                console.log(`Added expense: ${serviceName} - $${expenseAmount}`);
            }
        }
        
        allExpenses.push(...expenses);
        }
        
        const totalCost = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        
        return {
            userId,
            status: 'success',
            monthsProcessed: months,
            expensesCreated: allExpenses.length,
            duplicatesSkipped: totalDuplicates,
            belowMinimumSkipped: totalSkipped,
            totalAmount: totalCost.toFixed(2)
        };
        
    } catch (error) {
        console.error(`Error importing costs for user ${userId}:`, error);
        return {
            userId,
            status: 'error',
            error: error.message
        };
    }
}

// Main handler - can be triggered by EventBridge or API Gateway
exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        let results = [];
        
        // Parse months from request body (works for both API Gateway and EventBridge)
        let months = 1;
        if (event.body) {
            try {
                // Decode base64 if needed (API Gateway encodes body)
                let bodyString = event.body;
                if (event.isBase64Encoded) {
                    bodyString = Buffer.from(event.body, 'base64').toString('utf-8');
                }
                const body = JSON.parse(bodyString);
                months = parseInt(body.months) || 1;
                console.log(`Parsed months parameter: ${months}`);
            } catch (e) {
                console.log('Could not parse request body:', e.message, 'defaulting to 1 month');
            }
        }
        
        // Check if this is a manual trigger for a specific user (API Gateway)
        if (event.requestContext && event.requestContext.authorizer) {
            console.log('Manual import via API Gateway with authorizer');
            const userId = event.requestContext.authorizer.claims.sub;
            const result = await importCostsForUser(userId, months);
            results.push(result);
        } else if (event.requestContext && !event.requestContext.authorizer) {
            // API Gateway request but no authorizer (need to get userId from credentials table)
            console.log('Manual import via API Gateway without authorizer');
            
            // Get all users with AWS credentials configured
            const scanResult = await docClient.send(new ScanCommand({
                TableName: CREDENTIALS_TABLE,
                FilterExpression: 'enabled = :enabled',
                ExpressionAttributeValues: {
                    ':enabled': true
                }
            }));
            
            console.log(`Found ${scanResult.Items.length} users with AWS credentials enabled`);
            
            // Import for each user with the specified number of months
            for (const credentials of scanResult.Items) {
                const result = await importCostsForUser(credentials.userId, months);
                results.push(result);
            }
        } else {
            // Scheduled trigger (EventBridge) - import for all users
            console.log('Scheduled import for all users');
            
            // Get all users with AWS credentials configured
            const scanResult = await docClient.send(new ScanCommand({
                TableName: CREDENTIALS_TABLE,
                FilterExpression: 'enabled = :enabled',
                ExpressionAttributeValues: {
                    ':enabled': true
                }
            }));
            
            console.log(`Found ${scanResult.Items.length} users with AWS credentials enabled`);
            
            // Import costs for each user
            for (const item of scanResult.Items) {
                const result = await importCostsForUser(item.userId, months);
                results.push(result);
            }
        }
        
        const summary = {
            totalUsers: results.length,
            successful: results.filter(r => r.status === 'success').length,
            skipped: results.filter(r => r.status === 'skipped').length,
            errors: results.filter(r => r.status === 'error').length,
            results
        };
        
        console.log('Import summary:', JSON.stringify(summary, null, 2));
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(summary)
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: error.message })
        };
    }
};

