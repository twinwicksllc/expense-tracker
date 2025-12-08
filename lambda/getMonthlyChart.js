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
    
    // Validate groupBy parameter
    const groupBy = params.groupBy || 'category';
    if (!['project', 'vendor', 'category'].includes(groupBy)) {
        throw new Error('Invalid groupBy parameter. Must be: project, vendor, or category');
    }
    
    // Parse date range (use UTC to avoid timezone issues)
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    
    let startDate, endDate;
    
    if (params.period === 'mtd') {
        // Month to date
        const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
        startDate = firstDayOfMonth.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    } else if (params.period === '6') {
        // Last 6 months
        const sixMonthsAgo = new Date(Date.UTC(currentYear, currentMonth - 6, 1));
        startDate = sixMonthsAgo.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    } else if (params.period === 'ytd') {
        // Year to date
        startDate = `${currentYear}-01-01`;
        endDate = now.toISOString().split('T')[0];
    } else if (params.period === 'all') {
        // All time (set to 10 years ago)
        startDate = `${currentYear - 10}-01-01`;
        endDate = now.toISOString().split('T')[0];
    } else {
        // Default: Last 12 months
        const twelveMonthsAgo = new Date(Date.UTC(currentYear, currentMonth - 12, 1));
        startDate = twelveMonthsAgo.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    }
    
    // Allow custom date range override with validation
    if (params.startDate) {
        // Validate ISO 8601 format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
            throw new Error('Invalid startDate format. Must be YYYY-MM-DD');
        }
        startDate = params.startDate;
    }
    if (params.endDate) {
        // Validate ISO 8601 format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
            throw new Error('Invalid endDate format. Must be YYYY-MM-DD');
        }
        endDate = params.endDate;
    }
    
    // Validate date range logic
    if (startDate > endDate) {
        throw new Error('startDate must be before or equal to endDate');
    }
    
    return { groupBy, startDate, endDate };
}

/**
 * Get grouping key for an expense based on groupBy parameter
 */
function getGroupKey(expense, groupBy) {
    if (groupBy === 'project') {
        return expense.projectName || 'General Business Expense';
    } else if (groupBy === 'vendor') {
        return expense.vendor || 'Unknown';
    } else if (groupBy === 'category') {
        return expense.category || 'Uncategorized';
    }
    return 'Unknown';
}

/**
 * Aggregate expenses by month and grouping dimension
 */
function aggregateByMonth(expenses, groupBy, startDate, endDate) {
    const monthlyData = {};
    const groupTotals = {};
    
    // Filter expenses by date range
    const filteredExpenses = expenses.filter(exp => {
        const expDate = exp.transactionDate || exp.date;
        if (!expDate) return false;
        return expDate >= startDate && expDate <= endDate;
    });
    
    // Group by month and dimension
    filteredExpenses.forEach(exp => {
        const expDate = exp.transactionDate || exp.date;
        if (!expDate) return;
        
        // Extract year-month (YYYY-MM)
        const monthKey = expDate.substring(0, 7);
        
        // Get grouping key
        const groupKey = getGroupKey(exp, groupBy);
        
        // Initialize month if not exists
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = {};
        }
        
        // Validate amount is a finite number
        const amount = parseFloat(exp.amount);
        if (!isFinite(amount) || amount < 0) {
            console.warn(`Skipping expense ${exp.transactionId}: invalid amount ${exp.amount}`);
            return;
        }
        
        // Aggregate amount
        monthlyData[monthKey][groupKey] = (monthlyData[monthKey][groupKey] || 0) + amount;
        groupTotals[groupKey] = (groupTotals[groupKey] || 0) + amount;
    });
    
    // Convert to array format sorted by month
    const months = Object.keys(monthlyData).sort();
    const chartData = months.map(monthKey => ({
        month: monthKey,
        breakdown: monthlyData[monthKey]
    }));
    
    // Get all unique groups
    const groups = Object.keys(groupTotals).sort();
    
    return {
        months,
        groups,
        data: chartData,
        totals: groupTotals
    };
}

/**
 * Main handler for getMonthlyChart
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }
        
        // Parse and validate query parameters
        const { groupBy, startDate, endDate } = parseQueryParams(event);
        
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
        
        // Aggregate by month and grouping dimension
        const aggregatedData = aggregateByMonth(expenses, groupBy, startDate, endDate);
        
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
                groupBy,
                dateRange: {
                    start: startDate,
                    end: endDate
                },
                ...aggregatedData
            })
        };
    } catch (error) {
        console.error('Get monthly chart error:', error);
        
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
                message: error.message || 'Failed to get monthly chart data'
            })
        };
    }
};

