const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

module.exports.handler = async (event) => {
    const data = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;
    const projectId = `PROJ#${crypto.randomUUID()}`;

    const item = {
        userId,
        projectId,
        name: data.name,
        category: data.category,
        startDate: data.startDate,
        endDate: data.endDate,
        description: data.description,
        createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: process.env.PROJECTS_TABLE,
        Item: item
    }));

    return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN, "Access-Control-Allow-Credentials": true },
        body: JSON.stringify(item)
    };
};