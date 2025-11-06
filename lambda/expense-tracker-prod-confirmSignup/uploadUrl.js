const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const s3Client = new S3Client({});
const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET;

/**
 * Get user ID from Cognito authorizer context
 */
function getUserId(event) {
    return event.requestContext.authorizer?.claims?.sub || 
           event.requestContext.authorizer?.principalId;
}

/**
 * Generate pre-signed S3 URL for receipt upload
 */
exports.getUploadUrl = async (event) => {
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

        // Parse request body (handle both string and already-parsed object)
        console.log('Event body type:', typeof event.body);
        console.log('Event isBase64Encoded:', event.isBase64Encoded);
        
        let body;
        if (typeof event.body === 'string') {
            let bodyString = event.body;
            
            // Check if body is base64 encoded
            if (event.isBase64Encoded) {
                bodyString = Buffer.from(event.body, 'base64').toString('utf-8');
            }
            
            try {
                body = JSON.parse(bodyString);
            } catch (e) {
                console.error('Failed to parse body:', event.body);
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                    },
                    body: JSON.stringify({ message: 'Invalid JSON in request body' })
                };
            }
        } else {
            body = event.body || {};
        }
        
        const { fileName, contentType } = body;

        if (!fileName || !contentType) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'fileName and contentType are required' })
            };
        }

        // Validate content type
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!allowedTypes.includes(contentType)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Unsupported file type' })
            };
        }

        // Generate unique S3 key
        const fileExtension = fileName.split('.').pop();
        const s3Key = `receipts/${userId}/${uuidv4()}.${fileExtension}`;

        // Generate pre-signed URL (expires in 5 minutes)
        const command = new PutObjectCommand({
            Bucket: RECEIPTS_BUCKET,
            Key: s3Key,
            ContentType: contentType
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                uploadUrl,
                s3Key,
                expiresIn: 300
            })
        };
    } catch (error) {
        console.error('Get upload URL error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: error.message || 'Failed to generate upload URL'
            })
        };
    }
};

