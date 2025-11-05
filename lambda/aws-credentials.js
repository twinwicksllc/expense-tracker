const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const CREDENTIALS_TABLE = process.env.CREDENTIALS_TABLE || 'expense-tracker-aws-credentials-prod';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32-byte hex string

// Simple encryption using AES-256-GCM
function encrypt(text) {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    };
}

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

// Save AWS credentials
async function saveCredentials(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
    
    const { accessKeyId, secretAccessKey, region = 'us-east-1', enabled = true } = body;
    
    if (!accessKeyId || !secretAccessKey) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Access Key ID and Secret Access Key are required' })
        };
    }
    
    // Encrypt the credentials
    const encryptedAccessKey = encrypt(accessKeyId);
    const encryptedSecretKey = encrypt(secretAccessKey);
    
    const item = {
        userId,
        accessKeyId: encryptedAccessKey,
        secretAccessKey: encryptedSecretKey,
        region,
        enabled,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
        TableName: CREDENTIALS_TABLE,
        Item: item
    }));
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            message: 'AWS credentials saved successfully',
            region,
            enabled
        })
    };
}

// Get AWS credentials status (not the actual credentials)
async function getCredentialsStatus(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    
    const result = await docClient.send(new GetCommand({
        TableName: CREDENTIALS_TABLE,
        Key: { userId }
    }));
    
    if (!result.Item) {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                configured: false
            })
        };
    }
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            configured: true,
            region: result.Item.region,
            enabled: result.Item.enabled,
            createdAt: result.Item.createdAt,
            updatedAt: result.Item.updatedAt
        })
    };
}

// Delete AWS credentials
async function deleteCredentials(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    
    await docClient.send(new DeleteCommand({
        TableName: CREDENTIALS_TABLE,
        Key: { userId }
    }));
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            message: 'AWS credentials deleted successfully'
        })
    };
}

// Toggle enabled status
async function toggleCredentials(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
    
    const { enabled } = body;
    
    const result = await docClient.send(new GetCommand({
        TableName: CREDENTIALS_TABLE,
        Key: { userId }
    }));
    
    if (!result.Item) {
        return {
            statusCode: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'AWS credentials not found' })
        };
    }
    
    result.Item.enabled = enabled;
    result.Item.updatedAt = new Date().toISOString();
    
    await docClient.send(new PutCommand({
        TableName: CREDENTIALS_TABLE,
        Item: result.Item
    }));
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            message: 'AWS credentials status updated',
            enabled
        })
    };
}

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        const method = event.httpMethod;
        const path = event.path;
        
        if (method === 'POST' && path === '/aws-credentials') {
            return await saveCredentials(event);
        } else if (method === 'GET' && path === '/aws-credentials') {
            return await getCredentialsStatus(event);
        } else if (method === 'DELETE' && path === '/aws-credentials') {
            return await deleteCredentials(event);
        } else if (method === 'PUT' && path === '/aws-credentials/toggle') {
            return await toggleCredentials(event);
        }
        
        return {
            statusCode: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Not found' })
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

// Export decrypt function for use by cost import Lambda
exports.decrypt = decrypt;

