const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const bedrockClient = new BedrockRuntimeClient({});
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
 * Parse receipt using Amazon Bedrock (Nova Pro) - reads from S3
 */
exports.parseReceipt = async (event) => {
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

        // Parse body (handle base64 encoding)
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
        
        const { s3Key } = body;

        if (!s3Key) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 's3Key is required' })
            };
        }

        // Verify the file belongs to this user
        if (!s3Key.startsWith(`receipts/${userId}/`)) {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
                },
                body: JSON.stringify({ message: 'Access denied' })
            };
        }

        // Get file from S3
        console.log('Fetching file from S3:', s3Key);
        const getCommand = new GetObjectCommand({
            Bucket: RECEIPTS_BUCKET,
            Key: s3Key
        });

        const s3Response = await s3Client.send(getCommand);
        const fileBuffer = await streamToBuffer(s3Response.Body);
        const fileBase64 = fileBuffer.toString('base64');
        const contentType = s3Response.ContentType || 'application/pdf';

        console.log('File retrieved from S3, size:', fileBuffer.length, 'bytes');

        // Determine format for Nova
        let format = 'jpeg';
        if (contentType.includes('png')) format = 'png';
        else if (contentType.includes('gif')) format = 'gif';
        else if (contentType.includes('webp')) format = 'webp';
        else if (contentType.includes('pdf')) format = 'pdf';

        // Prepare prompt for Nova Pro
        const prompt = `You are an AI assistant that extracts information from receipt images and documents. 
Analyze the receipt and extract the following information in JSON format:

{
  "vendor": "Name of the business/vendor",
  "amount": "Total amount as a number (e.g., 45.99)",
  "date": "Transaction date in YYYY-MM-DD format",
  "category": "Best matching category from: Office Supplies, Travel, Meals, Software, Equipment, Marketing, Other",
  "items": ["List of line items if clearly visible"]
}

Important:
- Extract only the total amount, not subtotals or tax amounts separately
- Use the exact date format YYYY-MM-DD
- Choose the most appropriate category based on the vendor and items
- If any field is unclear or not visible, use reasonable defaults or "Unknown"
- Return ONLY valid JSON, no additional text

Analyze this receipt:`;

        // Call Bedrock with Amazon Nova Pro
        const modelId = 'us.amazon.nova-pro-v1:0';
        
        const requestBody = {
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            document: {
                                format: format,
                                name: 'receipt',
                                source: {
                                    bytes: fileBase64
                                }
                            }
                        },
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            inferenceConfig: {
                maxTokens: 1000,
                temperature: 0.2,
                topP: 0.9
            }
        };

        console.log('Calling Nova Pro for receipt parsing...');
        const command = new InvokeModelCommand({
            modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(requestBody)
        });

        const response = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        // Extract the text content from Nova's response
        const textContent = responseBody.output?.message?.content?.[0]?.text || '{}';
        console.log('Nova Pro response:', textContent);
        
        // Parse the JSON from Nova's response
        let parsedData;
        try {
            // Try to extract JSON from the response
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            parsedData = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);
        } catch (parseError) {
            console.error('Failed to parse Nova response:', textContent);
            // Return default structure if parsing fails
            parsedData = {
                vendor: 'Unknown',
                amount: 0,
                date: new Date().toISOString().split('T')[0],
                category: 'Other',
                items: []
            };
        }

        // Ensure amount is a number
        if (typeof parsedData.amount === 'string') {
            parsedData.amount = parseFloat(parsedData.amount.replace(/[^0-9.]/g, ''));
        }

        // Log usage for cost tracking
        console.log('Bedrock usage:', {
            modelId,
            inputTokens: responseBody.usage?.inputTokens || 0,
            outputTokens: responseBody.usage?.outputTokens || 0,
            userId
        });

        // Add s3Key to response so frontend knows which file was parsed
        parsedData.s3Key = s3Key;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify(parsedData)
        };
    } catch (error) {
        console.error('Parse receipt error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
            },
            body: JSON.stringify({
                message: error.message || 'Failed to parse receipt',
                error: error.toString()
            })
        };
    }
};

/**
 * Helper function to convert stream to buffer
 */
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

