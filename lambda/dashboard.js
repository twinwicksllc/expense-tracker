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
 * Input validation helpers
 */
const VALID_CATEGORIES = ['Office Supplies', 'Travel', 'Meals', 'Software', 'Equipment', 'Marketing', 'Other'];

function validateExpenseInput(data) {
    const errors = [];
    
    // Validate vendor
    if (!data.vendor || typeof data.vendor !== 'string') {
        errors.push('Vendor is required and must be a string');
    } else if (data.vendor.length < 1 || data.vendor.length > 200) {
        errors.push('Vendor must be between 1 and 200 characters');
    }
    
    // Validate amount
    if (data.amount === undefined || data.amount === null) {
        errors.push('Amount is required');
    } else {
        const amount = parseFloat(data.amount);
        if (isNaN(amount)) {
            errors.push('Amount must be a valid number');
        } else if (amount <= 0) {
            errors.push('Amount must be greater than 0');
        } else if (amount > 1000000) {
            errors.push('Amount must be less than $1,000,000');
        }
    }
    
    // Validate date
    if (!data.date || typeof data.date !== 'string') {
        errors.push('Date is required and must be a string');
    } else {
        const dateObj = new Date(data.date);
        if (isNaN(dateObj.getTime())) {
            errors.push('Date must be a valid date format');
        }
        // Check if date is not in the future
        if (dateObj > new Date()) {
            errors.push('Date cannot be in the future');
        }
    }
    
    // Validate category
    if (!data.category || typeof data.category !== 'string') {
        errors.push('Category is required and must be a string');
    } else if (!VALID_CATEGORIES.includes(data.category)) {
        errors.push(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    
    // Validate optional fields
    if (data.description && typeof data.description !== 'string') {
        errors.push('Description must be a string');
    } else if (data.description && data.description.length > 1000) {
        errors.push('Description must be less than 1000 characters');
    }
    
    if (data.notes && typeof data.notes !== 'string') {
        errors.push('Notes must be a string');
    } else if (data.notes && data.notes.length > 1000) {
        errors.push('Notes must be less than 1000 characters');
    }
    
    if (data.s3Key && typeof data.s3Key !== 'string') {
        errors.push('S3 key must be a string');
    } else if (data.s3Key && data.s3Key.length > 500) {
        errors.push('S3 key is invalid');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

function sanitizeString(str, maxLength = 1000) {
    if (!str) return '';
    return String(str).trim().substring(0, maxLength);
}

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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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

        // Validate input
        const validation = validateExpenseInput({ vendor, amount, date, category, description, notes, s3Key });
        if (!validation.isValid) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ 
                    message: 'Validation failed', 
                    errors: validation.errors 
                })
            };
        }

        const transactionId = uuidv4();
        const uploadDate = new Date().toISOString();
        
        // Create transaction record
        const transaction = {
            userId,
            transactionId,
            amount: parseFloat(amount),
            category: sanitizeString(category, 50),
            vendor: sanitizeString(vendor, 200),
            description: sanitizeString(description, 1000),
            notes: sanitizeString(notes, 1000),
            transactionDate: date,
            uploadDate,
            status: 'processed'
        };
        
        // Only add receipt fields if s3Key is provided
        if (s3Key) {
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
            
            transaction.receiptUrl = receiptUrl;
            transaction.receiptKey = receiptKey;
        }

        await docClient.send(new PutCommand({
            TableName: TRANSACTIONS_TABLE,
            Item: transaction
        }));

        return {
            statusCode: 201,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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

        // Regenerate presigned URLs for receipts (7 day expiration)
        for (const expense of expenses) {
            if (expense.receiptKey) {
                try {
                    expense.receiptUrl = await getSignedUrl(
                        s3Client,
                        new GetObjectCommand({
                            Bucket: RECEIPTS_BUCKET,
                            Key: expense.receiptKey
                        }),
                        { expiresIn: 604800 } // 7 days
                    );
                } catch (error) {
                    console.error(`Failed to generate presigned URL for ${expense.receiptKey}:`, error);
                    expense.receiptUrl = null;
                }
            }
        }

        return {
            statusCode: 200,
            headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }

        const transactionId = event.pathParameters.transactionId;
        const updates = JSON.parse(event.body);

        // Validate update data
        const validation = validateExpenseInput({
            vendor: updates.vendor || 'placeholder',
            amount: updates.amount !== undefined ? updates.amount : 1,
            date: updates.transactionDate || '2024-01-01',
            category: updates.category || 'Other',
            description: updates.description,
            notes: updates.notes
        });
        
        // Check only the fields being updated
        const updateValidation = { isValid: true, errors: [] };
        if (updates.vendor !== undefined) {
            if (!updates.vendor || typeof updates.vendor !== 'string' || updates.vendor.length < 1 || updates.vendor.length > 200) {
                updateValidation.isValid = false;
                updateValidation.errors.push('Vendor must be between 1 and 200 characters');
            }
        }
        if (updates.amount !== undefined) {
            const amount = parseFloat(updates.amount);
            if (isNaN(amount) || amount <= 0 || amount > 1000000) {
                updateValidation.isValid = false;
                updateValidation.errors.push('Amount must be a valid number between 0 and $1,000,000');
            }
        }
        if (updates.category !== undefined) {
            if (!VALID_CATEGORIES.includes(updates.category)) {
                updateValidation.isValid = false;
                updateValidation.errors.push(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`);
            }
        }
        if (updates.transactionDate !== undefined) {
            const dateObj = new Date(updates.transactionDate);
            if (isNaN(dateObj.getTime())) {
                updateValidation.isValid = false;
                updateValidation.errors.push('Date must be a valid date format');
            }
        }
        
        if (!updateValidation.isValid) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ 
                    message: 'Validation failed', 
                    errors: updateValidation.errors 
                })
            };
        }

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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
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
        // Handle OPTIONS request for CORS preflight
        if (event.httpMethod === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://app.twin-wicks.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,GET'
                },
                body: JSON.stringify({ message: 'OK' })
            };
        }

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

        // Parse query parameters
        const ALLOWED_PERIODS = ['mtd', 'ytd', 'current_month', 'last_month', '6months', '12months'];
        const ALLOWED_GROUP_BY = ['vendor', 'category', 'project'];
        const ALLOWED_VIEWS = ['monthly-chart', 'project-breakdown'];
        
        const period = event.queryStringParameters?.period || 'mtd';
        const view = event.queryStringParameters?.view;
        const projectId = event.queryStringParameters?.projectId;
        const groupBy = event.queryStringParameters?.groupBy || 'vendor';
        
        // Validate inputs
        if (!ALLOWED_PERIODS.includes(period)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: `Invalid period. Must be one of: ${ALLOWED_PERIODS.join(', ')}` })
            };
        }
        
        if (!ALLOWED_GROUP_BY.includes(groupBy)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: `Invalid groupBy. Must be one of: ${ALLOWED_GROUP_BY.join(', ')}` })
            };
        }
        
        if (view && !ALLOWED_VIEWS.includes(view)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: `Invalid view. Must be one of: ${ALLOWED_VIEWS.join(', ')}` })
            };
        }
        
        console.log(`Dashboard request: userId=${userId}, period=${period}, groupBy=${groupBy}, view=${view}, projectId=${projectId}`);

        // Get all expenses
        const result = await docClient.send(new QueryCommand({
            TableName: TRANSACTIONS_TABLE,
            IndexName: 'userId-uploadDate-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        }));

        const allExpenses = result.Items || [];

        // Regenerate presigned URLs for all receipts (7 day expiration)
        for (const expense of allExpenses) {
            if (expense.receiptKey) {
                try {
                    expense.receiptUrl = await getSignedUrl(
                        s3Client,
                        new GetObjectCommand({
                            Bucket: RECEIPTS_BUCKET,
                            Key: expense.receiptKey
                        }),
                        { expiresIn: 604800 } // 7 days
                    );
                } catch (error) {
                    console.error(`Failed to generate presigned URL for ${expense.receiptKey}:`, error);
                    expense.receiptUrl = null;
                }
            }
        }

        // Handle project breakdown view
        if (view === 'project-breakdown') {
            if (!projectId) {
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': 'https://teckstart.com',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                    },
                    body: JSON.stringify({ message: 'projectId is required for project-breakdown view' })
                };
            }

            // Filter expenses for this project
            console.log(`Project breakdown request: projectId=${projectId}, total expenses=${allExpenses.length}`);
            const projectExpenses = allExpenses.filter(exp => exp.projectId === projectId);
            console.log(`Filtered project expenses: ${projectExpenses.length}`);

            if (projectExpenses.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': 'https://teckstart.com',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                    },
                    body: JSON.stringify({ message: 'Project not found or access denied' })
                };
            }

            // Calculate project totals
            const totalAmount = projectExpenses.reduce((sum, exp) => sum + exp.amount, 0);

            // Group by category
            const byCategory = {};
            projectExpenses.forEach(exp => {
                const cat = exp.category || 'Uncategorized';
                byCategory[cat] = (byCategory[cat] || 0) + exp.amount;
            });

            // Group by vendor
            const byVendor = {};
            projectExpenses.forEach(exp => {
                const vendor = exp.vendor || 'Unknown';
                byVendor[vendor] = (byVendor[vendor] || 0) + exp.amount;
            });

            const projectBreakdown = {
                projectId: projectId,
                totalAmount: totalAmount,
                expenseCount: projectExpenses.length,
                byCategory: byCategory,
                byVendor: byVendor,
                expenses: projectExpenses.sort((a, b) => new Date(b.date) - new Date(a.date))
            };

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://teckstart.com',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify(projectBreakdown)
            };
        }

        // Calculate date ranges
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        
        let startDate, endDate, compareStartDate, compareEndDate;
        
        if (period === 'ytd') {
            // Year to date
            startDate = new Date(currentYear, 0, 1); // Jan 1 of current year
            endDate = now;
            // Compare to same period last year
            compareStartDate = new Date(currentYear - 1, 0, 1);
            compareEndDate = new Date(currentYear - 1, currentMonth, now.getDate());
        } else if (period === 'current_month') {
            // Current month
            startDate = new Date(currentYear, currentMonth, 1);
            endDate = now;
            // Compare to last month
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            compareStartDate = new Date(lastMonthYear, lastMonth, 1);
            compareEndDate = new Date(lastMonthYear, lastMonth + 1, 0); // Last day of last month
        } else if (period === 'mtd') {
            // Month to date
            startDate = new Date(currentYear, currentMonth, 1);
            endDate = now;
            // Compare to same period last month
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            compareStartDate = new Date(lastMonthYear, lastMonth, 1);
            compareEndDate = new Date(lastMonthYear, lastMonth, now.getDate()); // Same day last month
        } else if (period === '6months') {
            // Last 6 months
            startDate = new Date(currentYear, currentMonth - 5, 1);
            endDate = now;
            // Compare to 6 months before that
            compareStartDate = new Date(currentYear, currentMonth - 11, 1);
            compareEndDate = new Date(currentYear, currentMonth - 5, 0);
        } else if (period === '12months') {
            // Last 12 months
            startDate = new Date(currentYear, currentMonth - 11, 1);
            endDate = now;
            // Compare to 12 months before that
            compareStartDate = new Date(currentYear - 1, currentMonth - 11, 1);
            compareEndDate = new Date(currentYear - 1, currentMonth, 0);
        } else if (period === 'last_month') {
            // Last month
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            startDate = new Date(lastMonthYear, lastMonth, 1);
            endDate = new Date(lastMonthYear, lastMonth + 1, 0);
            // Compare to month before last
            const twoMonthsAgo = lastMonth === 0 ? 11 : lastMonth - 1;
            const twoMonthsAgoYear = lastMonth === 0 ? lastMonthYear - 1 : lastMonthYear;
            compareStartDate = new Date(twoMonthsAgoYear, twoMonthsAgo, 1);
            compareEndDate = new Date(twoMonthsAgoYear, twoMonthsAgo + 1, 0);
        }

        // Filter expenses by period
        console.log(`Filtering ${allExpenses.length} expenses for period=${period}, startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}`);
        const periodExpenses = allExpenses.filter(exp => {
            const expDate = new Date(exp.transactionDate || exp.date);
            return expDate >= startDate && expDate <= endDate;
        });

        const compareExpenses = allExpenses.filter(exp => {
            const expDate = new Date(exp.transactionDate || exp.date);
            return expDate >= compareStartDate && expDate <= compareEndDate;
        });

        // Calculate current period totals
        const currentTotal = periodExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const compareTotal = compareExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const percentChange = compareTotal > 0 ? ((currentTotal - compareTotal) / compareTotal * 100) : 0;

        // Group expenses by month and grouping dimension
        const monthlyData = {};
        
        periodExpenses.forEach(exp => {
            const expDate = new Date(exp.transactionDate || exp.date);
            const monthKey = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {};
            }

            // Determine grouping key
            let groupKey;
            if (groupBy === 'vendor') {
                groupKey = exp.vendor || 'Unknown';
            } else if (groupBy === 'category') {
                groupKey = exp.category || 'Uncategorized';
            } else if (groupBy === 'project') {
                groupKey = exp.projectId || 'General Business Expense';
            }

            monthlyData[monthKey][groupKey] = (monthlyData[monthKey][groupKey] || 0) + exp.amount;
        });

        // Convert monthly data to array format for charting
        const monthlyChartData = Object.keys(monthlyData)
            .sort()
            .map(monthKey => {
                const [year, month] = monthKey.split('-');
                const monthName = new Date(year, parseInt(month) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                
                return {
                    month: monthName,
                    monthKey: monthKey,
                    breakdown: monthlyData[monthKey]
                };
            });

        // Get all unique group keys for the legend
        const allGroupKeys = new Set();
        Object.values(monthlyData).forEach(monthData => {
            Object.keys(monthData).forEach(key => allGroupKeys.add(key));
        });

        // Calculate category breakdown for current period
        const categoryTotals = {};
        periodExpenses.forEach(exp => {
            categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
        });

        // Calculate vendor breakdown for current period
        const vendorTotals = {};
        periodExpenses.forEach(exp => {
            const vendor = exp.vendor || 'Unknown';
            vendorTotals[vendor] = (vendorTotals[vendor] || 0) + exp.amount;
        });

        // Calculate project breakdown for current period
        const projectTotals = {};
        periodExpenses.forEach(exp => {
            const project = exp.projectId || 'General Business Expense';
            projectTotals[project] = (projectTotals[project] || 0) + exp.amount;
        });

        // Calculate current month total for the stats card
        const currentMonthTotal = periodExpenses
            .filter(exp => {
                const d = new Date(exp.transactionDate || exp.date);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            })
            .reduce((sum, exp) => sum + exp.amount, 0);
        
        // Calculate comparison metrics
        const monthChangePercent = compareTotal > 0 ? ((currentTotal - compareTotal) / compareTotal * 100) : 0;
        const countChangePercent = compareExpenses.length > 0 ? 
            ((periodExpenses.length - compareExpenses.length) / compareExpenses.length * 100) : 0;
        
        const summary = {
            period: period,
            groupBy: groupBy,
            totalExpenses: currentTotal,
            currentMonthTotal: currentMonthTotal,
            transactionCount: periodExpenses.length,
            comparison: {
                totalChange: Math.round(monthChangePercent * 10) / 10,
                monthChange: Math.round(monthChangePercent * 10) / 10,
                countChange: Math.round(countChangePercent * 10) / 10
            },
            monthlyData: monthlyChartData,
            groupKeys: Array.from(allGroupKeys).sort(),
            breakdowns: {
                byCategory: categoryTotals,
                byVendor: vendorTotals,
                byProject: projectTotals
            },
            recentExpenses: periodExpenses
                .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
                .slice(0, 10)
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com',
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
                'Access-Control-Allow-Origin': 'https://teckstart.com',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: error.message || 'Failed to get dashboard data'
            })
        };
    }
};

