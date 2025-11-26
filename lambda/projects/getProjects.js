const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

module.exports.handler = async (event) => {
    const userId = event.requestContext.authorizer.claims.sub;

    const command = new QueryCommand({
        TableName: process.env.PROJECTS_TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId }
    });

    const result = await docClient.send(command);

    return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN, "Access-Control-Allow-Credentials": true },
        body: JSON.stringify(result.Items)
    };
};