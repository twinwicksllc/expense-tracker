const { CloudWatchLogsClient, PutLogEventsCommand, CreateLogStreamCommand, DescribeLogStreamsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const client = new CloudWatchLogsClient({ region: process.env.AWS_REGION || 'us-east-1' });
const LOG_GROUP = '/aws/lambda/expense-tracker-frontend-logs';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': 'https://teckstart.com',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Private-Network': 'true'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';
        const logEntry = JSON.parse(event.body);
        
        const logStreamName = `${userId}/${new Date().toISOString().split('T')[0]}`;
        
        await ensureLogStream(logStreamName);
        
        const logMessage = JSON.stringify({
            ...logEntry,
            userId: userId,
            sourceIP: event.requestContext?.identity?.sourceIp
        });

        const sequenceToken = await getSequenceToken(logStreamName);
        
        const params = {
            logGroupName: LOG_GROUP,
            logStreamName: logStreamName,
            logEvents: [{
                message: logMessage,
                timestamp: Date.now()
            }]
        };
        
        if (sequenceToken) {
            params.sequenceToken = sequenceToken;
        }

        await client.send(new PutLogEventsCommand(params));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error('Error logging to CloudWatch:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to log' })
        };
    }
};

async function ensureLogStream(logStreamName) {
    try {
        await client.send(new CreateLogStreamCommand({
            logGroupName: LOG_GROUP,
            logStreamName: logStreamName
        }));
    } catch (error) {
        if (error.name !== 'ResourceAlreadyExistsException') {
            throw error;
        }
    }
}

async function getSequenceToken(logStreamName) {
    try {
        const response = await client.send(new DescribeLogStreamsCommand({
            logGroupName: LOG_GROUP,
            logStreamNamePrefix: logStreamName
        }));
        
        return response.logStreams?.[0]?.uploadSequenceToken;
    } catch (error) {
        return null;
    }
}
