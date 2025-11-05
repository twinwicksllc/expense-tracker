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
const MIN_AMOUNT = parseFloat(process.env.MIN_AMOUNT || '1.00');

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

// Import costs for a single user
async function importCostsForUser(userId) {
    console.log(`Importing costs for user: ${userId}`);
    
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
    
    // Get previous month's date range
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const startDate = lastMonth.toISOString().split('T')[0];
    const endDate = lastMonthEnd.toISOString().split('T')[0];
    
    console.log(`Fetching costs from ${startDate} to ${endDate}`);
    
    try {
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
                
                // Skip if amount is too small
                if (amount < MIN_AMOUNT) {
                    console.log(`Skipping ${serviceName}: $${amount.toFixed(2)} (below minimum)`);
                    continue;
                }
                
                const transactionId = uuidv4();
                const now = new Date().toISOString();
                const expense = {
                    userId,
                    transactionId,
                    vendor: `AWS - ${serviceName}`,
                    amount: parseFloat(amount.toFixed(2)),
                    date: endDate,
                    category: 'Software',
                    description: `AWS ${serviceName} charges for ${lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
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
                console.log(`Added expense: ${serviceName} - $${amount.toFixed(2)}`);
            }
        }
        
        const totalCost = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        
        return {
            userId,
            status: 'success',
            period: `${startDate} to ${endDate}`,
            expensesCreated: expenses.length,
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
        
        // Check if this is a manual trigger for a specific user (API Gateway)
        if (event.requestContext && event.requestContext.authorizer) {
            const userId = event.requestContext.authorizer.claims.sub;
            const result = await importCostsForUser(userId);
            results.push(result);
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
                const result = await importCostsForUser(item.userId);
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

