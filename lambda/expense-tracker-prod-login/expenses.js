const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const multipart = require('lambda-multipart-parser');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE;
const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET;

/**
 * Get user ID from Cognito authorizer context
 */
function getUserId(event) {
    return event.requestContext.authorizer?.claims?.sub || 
           event.requestContext.authorizer?.principalId;
}

/**
 * Create new expense
 */
exports.createExpense = async (event) => {
    try {
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

        // Parse request body (handle base64 encoding)
        let body;
        if (typeof event.body === 'string') {
            let bodyString = event.body;
            if (event.isBase64Encoded) {
                bodyString = Buffer.from(event.body, 'base64').toString('utf-8');
            }
            body = JSON.parse(bodyString);
        } else {
            body = event.body || {};
        }

        const { vendor, amount, date, category, description, notes, s3Key } = body;

        if (!s3Key) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Receipt file is required' })
            };
        }

        const transactionId = uuidv4();
        const uploadDate = new Date().toISOString();
        
        // Receipt is already uploaded to S3, just use the s3Key
        const receiptKey = s3Key;

        // Generate signed URL for receipt access (valid for 7 days)
        const receiptUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
                Bucket: RECEIPTS_BUCKET,
                Key: receiptKey
            }),
            { expiresIn: 604800 }
        );

        // Create transaction record
        const transaction = {
            userId,
            transactionId,
            amount: parseFloat(amount),
            category,
            vendor,
            description: description || '',
            notes: notes || '',
            transactionDate: date,
            uploadDate,
            receiptUrl,
            receiptKey,
            status: 'processed'
        };

        await docClient.send(new PutCommand({
            TableName: TRANSACTIONS_TABLE,
            Item: transaction
        }));

        return {
            statusCode: 201,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify(transaction)
        };
    } catch (error) {
        console.error('Create expense error:', error);
        
        return {
            statusCode: 500,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify({
                message: error.message || 'Failed to create expense'
            })
        };
    }
};

/**
 * Get all expenses for user
 */
exports.getExpenses = async (event) => {
    try {
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

        const params = event.queryStringParameters || {};
        const sortBy = params.sortBy || 'uploadDate';
        const order = params.order || 'desc';
        const category = params.category;

        // Query all transactions for user
        const queryParams = {
            TableName: TRANSACTIONS_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        };

        // Use GSI if sorting by uploadDate
        if (sortBy === 'uploadDate') {
            queryParams.IndexName = 'userId-uploadDate-index';
            queryParams.ScanIndexForward = order === 'asc';
        }

        console.log('Query params:', JSON.stringify(queryParams));
        const result = await docClient.send(new QueryCommand(queryParams));
        console.log('Query result count:', result.Count);
        console.log('Query items:', JSON.stringify(result.Items));
        let expenses = result.Items || [];

        // Filter by category if specified
        if (category) {
            expenses = expenses.filter(exp => exp.category === category);
        }

        // Sort if not using GSI
        if (sortBy !== 'uploadDate') {
            expenses.sort((a, b) => {
                const aVal = a[sortBy];
                const bVal = b[sortBy];
                const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return order === 'asc' ? comparison : -comparison;
            });
        }

        return {
            statusCode: 200,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify(expenses)
        };
    } catch (error) {
        console.error('Get expenses error:', error);
        
        return {
            statusCode: 500,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify({
                message: error.message || 'Failed to get expenses'
            })
        };
    }
};

/**
 * Get single expense
 */
exports.getExpense = async (event) => {
    try {
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

        const transactionId = event.pathParameters.transactionId;

        const result = await docClient.send(new GetCommand({
            TableName: TRANSACTIONS_TABLE,
            Key: { userId, transactionId }
        }));

        if (!result.Item) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Expense not found' })
            };
        }

        return {
            statusCode: 200,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify(result.Item)
        };
    } catch (error) {
        console.error('Get expense error:', error);
        
        return {
            statusCode: 500,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify({
                message: error.message || 'Failed to get expense'
            })
        };
    }
};

/**
 * Update expense
 */
exports.updateExpense = async (event) => {
    try {
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

        const transactionId = event.pathParameters.transactionId;
        const updates = JSON.parse(event.body);

        // Build update expression
        const updateFields = ['amount', 'category', 'vendor', 'description', 'transactionDate'];
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};

        updateFields.forEach(field => {
            if (updates[field] !== undefined) {
                updateExpressions.push(`#${field} = :${field}`);
                expressionAttributeNames[`#${field}`] = field;
                expressionAttributeValues[`:${field}`] = updates[field];
            }
        });

        if (updateExpressions.length === 0) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'No valid fields to update' })
            };
        }

        const result = await docClient.send(new UpdateCommand({
            TableName: TRANSACTIONS_TABLE,
            Key: { userId, transactionId },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        }));

        return {
            statusCode: 200,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify(result.Attributes)
        };
    } catch (error) {
        console.error('Update expense error:', error);
        
        return {
            statusCode: 500,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify({
                message: error.message || 'Failed to update expense'
            })
        };
    }
};

/**
 * Delete expense
 */
exports.deleteExpense = async (event) => {
    try {
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

        const transactionId = event.pathParameters.transactionId;

        // Get expense to find receipt key
        const getResult = await docClient.send(new GetCommand({
            TableName: TRANSACTIONS_TABLE,
            Key: { userId, transactionId }
        }));

        if (!getResult.Item) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Expense not found' })
            };
        }

        // Delete receipt from S3
        if (getResult.Item.receiptKey) {
            await s3Client.send(new DeleteObjectCommand({
                Bucket: RECEIPTS_BUCKET,
                Key: getResult.Item.receiptKey
            }));
        }

        // Delete transaction from DynamoDB
        await docClient.send(new DeleteCommand({
            TableName: TRANSACTIONS_TABLE,
            Key: { userId, transactionId }
        }));

        return {
            statusCode: 200,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify({ message: 'Expense deleted successfully' })
        };
    } catch (error) {
        console.error('Delete expense error:', error);
        
        return {
            statusCode: 500,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify({
                message: error.message || 'Failed to delete expense'
            })
        };
    }
};

/**
 * Get dashboard summary
 */
exports.getDashboard = async (event) => {
    try {
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

        // Get all expenses
        const result = await docClient.send(new QueryCommand({
            TableName: TRANSACTIONS_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        }));

        const expenses = result.Items || [];

        // Calculate summary statistics
        const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const categoryTotals = {};
        
        expenses.forEach(exp => {
            categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
        });

        const summary = {
            totalExpenses: totalAmount,
            transactionCount: expenses.length,
            categoryBreakdown: categoryTotals,
            recentExpenses: expenses
                .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
                .slice(0, 10)
        };

        return {
            statusCode: 200,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify(summary)
        };
    } catch (error) {
        console.error('Get dashboard error:', error);
        
        return {
            statusCode: 500,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
            body: JSON.stringify({
                message: error.message || 'Failed to get dashboard data'
            })
        };
    }
};

