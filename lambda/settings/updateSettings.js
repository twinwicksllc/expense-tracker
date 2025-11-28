const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { encrypt } = require("../utils/encryption");

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

module.exports.handler = async (event) => {
    try {
        const userId = event.requestContext.authorizer.claims.sub;
        const { accessKeyId, secretAccessKey } = JSON.parse(event.body);

        if (!accessKeyId || !secretAccessKey) {
             throw new Error("Missing credentials");
        }

        const item = {
            userId: userId,
            projectId: 'SETTINGS', // Special reserved Sort Key
            accessKeyId: encrypt(accessKeyId),
            secretAccessKey: encrypt(secretAccessKey),
            updatedAt: new Date().toISOString()
        };

        await docClient.send(new PutCommand({
            TableName: process.env.PROJECTS_TABLE,
            Item: item
        }));

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN, "Access-Control-Allow-Credentials": true },
            body: JSON.stringify({ message: "Credentials encrypted and saved." })
        };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};