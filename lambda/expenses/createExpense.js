const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

module.exports.handler = async (event) => {
    const data = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub; // From Cognito Token
    const type = data.type || 'expense';
    
    // Prefix ID based on type for sorting logic later
    const prefix = type === 'project' ? 'PROJ' : 'EXP';
    const transactionId = `${prefix}#${crypto.randomUUID()}`;

    const item = {
        userId,
        transactionId,
        uploadDate: new Date().toISOString(),
        ...data // Spreads vendor, amount, etc.
    };

    await docClient.send(new PutCommand({
        TableName: process.env.TRANSACTIONS_TABLE,
        Item: item
    }));

    return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN, "Access-Control-Allow-Credentials": true },
        body: JSON.stringify(item)
    };
};