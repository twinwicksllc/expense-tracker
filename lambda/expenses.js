JavaScript File: lambda_expenses.js

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const multipart = require('lambda-multipart-parser');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });

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
    
    // Validate project (optional)
    if (data.projectId && typeof data.projectId !== 'string') {
        errors.push('Project ID must be a string');
    } else if (data.projectId && data.projectId.length > 120) {
        errors.push('Project ID is too long');
    }
    
    if (data.projectName && typeof data.projectName !== 'string') {
        errors.push('Project name must be a string');
    } else if (data.projectName && data.projectName.length > 120) {
        errors.push('Project name must be 120 characters or less');
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
 * Get primary user ID from Cognito authorizer context
 * Handles both direct (email/password) and federated (Google OAuth) logins
 * For federated logins, resolves to the primary linked account's sub
 */
async function getUserId(event) {
    const claims = event.requestContext?.authorizer?.claims;
    if (!claims) {
        return null;
    }
    
    // Check if this is a federated login (has identities claim)
    if (claims.identities) {
        try {
            // Parse identities to get the federated userId
            const identities = JSON.parse(claims.identities);
            if (identities && identities.length > 0) {
                const federatedUserId = identities[0].userId;
                
                // Query Cognito to get the primary user's details
                const command = new AdminGetUserCommand({
                    UserPoolId: process.env.USER_POOL_ID,
                    Username: federatedUserId
                });
                
                const user = await cognitoClient.send(command);
                
                // Find the primary user's sub attribute
                const subAttr = user.UserAttributes?.find(attr => attr.Name === 'sub');
                if (subAttr) {
                    console.log(`Resolved federated user ${federatedUserId} to primary user ${subAttr.Value}`);
                    return subAttr.Value;
                }
            }
        } catch (error) {
            console.error('Error resolving federated identity:', error);
            // Fall back to using the sub from claims
        }
    }
    
    // For direct logins or if resolution fails, use sub directly
    return claims.sub || event.requestContext.authorizer?.principalId;
}

/**
 * Create new expense
 */
exports.createExpense = async (event) => {
    try {
        const userId = await getUserId(event);
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

        const { vendor, amount, date, category, description, notes, s3Key, projectId, projectName } = body;

        // Validate input
        const validation = validateExpenseInput({ vendor, amount, date, category, description, notes, s3Key, projectId, projectName });
        if (!validation.isValid) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
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
        
        // Add project fields if provided
        if (projectId) {
            transaction.projectId = sanitizeString(projectId, 120);
        }
        if (projectName) {
            transaction.projectName = sanitizeString(projectName, 120);
        }
        
        // Only add receipt fields if s3Key is provided
        if (s3Key) {
            const receiptKey = s3Key;
            
            // Generate signed URL for receipt access (valid for 1 hour)
            const receiptUrl = await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                    Bucket: RECEIPTS_BUCKET,
                    Key: receiptKey
                }),
                { expiresIn: 3600 }
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
 */exports.listExpenses = async (event) => {
    try {
        const userId = await getUserId(event);
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
 *exports.deleteExpense = async (event) => {
    try {
        const userId = await getUserId(event);        if (!userId) {
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
        const userId = await getUserId(event);
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
        
        // Handle base64-encoded body
        let bodyString = event.body;
        if (event.isBase64Encoded && bodyString) {
            bodyString = Buffer.from(bodyString, 'base64').toString('utf-8');
        }
        
        const updates = JSON.parse(bodyString);

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
        if (updates.projectId !== undefined) {
            if (typeof updates.projectId !== 'string' || updates.projectId.length > 120) {
                updateValidation.isValid = false;
                updateValidation.errors.push('Project ID must be a string with max 120 characters');
            }
        }
        if (updates.projectName !== undefined) {
            if (typeof updates.projectName !== 'string' || updates.projectName.length > 120) {
                updateValidation.isValid = false;
                updateValidation.errors.push('Project name must be a string with max 120 characters');
            }
        }
        
        if (!updateValidation.isValid) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
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
        const updateFields = ['amount', 'category', 'vendor', 'description', 'transactionDate', 'projectId', 'projectName'];
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
    