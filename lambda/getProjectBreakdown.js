const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE;

/**
 * Get user ID from Cognito authorizer context
 */
function getUserId(event) {
    return event.requestContext.authorizer?.claims?.sub || 
           event.requestContext.authorizer?.principalId;
}

/**
 * Validate and parse query parameters
 */
function parseQueryParams(event) {
    const params = event.queryStringParameters || {};
    
    let startDate = null;
    let endDate = null;
    
    // Validate startDate if provided
    if (params.startDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
            throw new Error('Invalid startDate format. Must be YYYY-MM-DD');
        }
        startDate = params.startDate;
    }
    
    // Validate endDate if provided
    if (params.endDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
            throw new Error('Invalid endDate format. Must be YYYY-MM-DD');
        }
        endDate = params.endDate;
    }
    
    // Validate date range logic
    if (startDate && endDate && startDate > endDate) {
        throw new Error('startDate must be before or equal to endDate');
    }
    
    return { startDate, endDate };
}

/**
 * Filter and aggregate expenses for a specific project
 */
function aggregateProjectExpenses(expenses, projectId, userId, startDate, endDate) {
    // Security: Filter by userId AND projectId
    let filteredExpenses = expenses.filter(exp => {
        // CRITICAL: Ensure expense belongs to authenticated user
        if (exp.userId !== userId) {
            console.warn(`Security: Attempted access to expense ${exp.transactionId} by wrong user`);
            return false;
        }
        
        // Filter by projectId (including expenses without projectId if projectId is null)
        if (projectId === null || projectId === 'business-expenses') {
            // Show expenses without projectId
            if (exp.projectId) return false;
        } else {
            // Show expenses with matching projectId
            if (exp.projectId !== projectId) return false;
        }
        
        return true;
    });
    
    // Filter by date range if provided
    if (startDate || endDate) {
        filteredExpenses = filteredExpenses.filter(exp => {
            const expDate = exp.transactionDate || exp.date;
            if (!expDate) return false;
            
            if (startDate && expDate < startDate) return false;
            if (endDate && expDate > endDate) return false;
            
            return true;
        });
    }
    
    // Calculate aggregations
    const byCategory = {};
    const byVendor = {};
    let totalExpenses = 0;
    let earliestDate = null;
    let latestDate = null;
    
    const expenseList = [];
    
    filteredExpenses.forEach(exp => {
        // Validate amount
        const amount = parseFloat(exp.amount);
        if (!isFinite(amount) || amount < 0) {
            console.warn(`Skipping expense ${exp.transactionId}: invalid amount ${exp.amount}`);
            return;
        }
        
        // Aggregate by category
        const category = exp.category || 'Uncategorized';
        byCategory[category] = (byCategory[category] || 0) + amount;
        
        // Aggregate by vendor
        const vendor = exp.vendor || 'Unknown';
        byVendor[vendor] = (byVendor[vendor] || 0) + amount;
        
        // Track total
        totalExpenses += amount;
        
        // Track date range
        const expDate = exp.transactionDate || exp.date;
        if (expDate) {
            if (!earliestDate || expDate < earliestDate) {
                earliestDate = expDate;
            }
            if (!latestDate || expDate > latestDate) {
                latestDate = expDate;
            }
        }
        
        // Add to expense list
        expenseList.push({
            transactionId: exp.transactionId,
            date: exp.transactionDate || exp.date,
            vendor: exp.vendor,
            category: exp.category,
            amount: amount,
            description: exp.description || '',
            receiptUrl: exp.receiptUrl || null
        });
    });
    
    // Sort expenses by date (newest first)
    expenseList.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA);
    });
    
    return {
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        expenseCount: expenseList.length,
        dateRange: {
            start: earliestDate || startDate,
            end: latestDate || endDate
        },
        byCategory,
        byVendor,
        expenses: expenseList
    };
}

/**
 * Main handler for getProjectBreakdown
 */
exports.handler = async (event) => {
    try {
        // Validate user authentication
        const userId = getUserId(event);
        if (!userId) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }
        
        // Get projectId from path parameters
        const projectId = event.pathParameters?.projectId || null;
        
        // Parse query parameters
        const { startDate, endDate } = parseQueryParams(event);
        
        // Query all expenses for the user
        const result = await docClient.send(new QueryCommand({
            TableName: TRANSACTIONS_TABLE,
            IndexName: 'userId-uploadDate-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        }));
        
        const expenses = result.Items || [];
        
        // Aggregate expenses for the project (with security validation)
        const aggregatedData = aggregateProjectExpenses(
            expenses,
            projectId,
            userId,
            startDate,
            endDate
        );
        
        // Validate that project exists for this user
        if (projectId && projectId !== 'business-expenses' && aggregatedData.expenseCount === 0) {
            // Check if project exists at all for this user
            const projectExists = expenses.some(exp => exp.userId === userId && exp.projectId === projectId);
            if (!projectExists) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                    },
                    body: JSON.stringify({
                        message: 'Project not found or access denied'
                    })
                };
            }
        }
        
        // Determine project name
        let projectName = 'General Business Expense';
        if (projectId && projectId !== 'business-expenses') {
            // Find project name from expenses
            const projectExpense = expenses.find(exp => exp.projectId === projectId);
            if (projectExpense && projectExpense.projectName) {
                projectName = projectExpense.projectName;
            } else {
                projectName = projectId;
            }
        }
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,GET',
                'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify({
                projectId: projectId || 'business-expenses',
                projectName,
                ...aggregatedData
            })
        };
    } catch (error) {
        console.error('Get project breakdown error:', error);
        
        return {
            statusCode: error.message.includes('Invalid') ? 400 : 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,GET',
                'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify({
                message: error.message || 'Failed to get project breakdown'
            })
        };
    }
};

