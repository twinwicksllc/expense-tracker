const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { CostExplorerClient, GetCostAndUsageCommand } = require("@aws-sdk/client-cost-explorer");
const { decrypt } = require("../utils/encryption");
const crypto = require("crypto");

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

module.exports.handler = async (event) => {
    try {
        const userId = event.requestContext.authorizer.claims.sub;

        // 1. Get Encrypted Creds
        const settingsRes = await docClient.send(new GetCommand({
            TableName: process.env.PROJECTS_TABLE,
            Key: { userId, projectId: 'SETTINGS' }
        }));

        if (!settingsRes.Item) {
            throw new Error("No AWS Credentials found in settings.");
        }

        const accessKeyId = decrypt(settingsRes.Item.accessKeyId);
        const secretAccessKey = decrypt(settingsRes.Item.secretAccessKey);

        // 2. Init Cost Explorer with User Creds
        const ce = new CostExplorerClient({
            region: "us-east-1",
            credentials: { accessKeyId, secretAccessKey }
        });

        // 3. Get Month-to-Date Costs
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const endDay = new Date(today.getFullYear(), today.getMonth() + 1, 0); // End of month

        const dateToString = (d) => d.toISOString().split('T')[0];

        const command = new GetCostAndUsageCommand({
            TimePeriod: { Start: dateToString(firstDay), End: dateToString(today) },
            Granularity: "MONTHLY",
            Metrics: ["UnblendedCost"],
            GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }]
        });

        const costData = await ce.send(command);

        // 4. Save results to Expenses Table
        const results = costData.ResultsByTime[0]?.Groups || [];
        
        for (const group of results) {
            const serviceName = group.Keys[0];
            const amount = parseFloat(group.Metrics.UnblendedCost.Amount);
            
            if (amount > 0) {
                // Use a deterministic ID so we update the same record instead of creating duplicates
                // Format: EXP#AWS#<Month>#<Service>
                const monthStr = dateToString(firstDay).substring(0, 7); // YYYY-MM
                const transactionId = `EXP#AWS#${monthStr}#${serviceName.replace(/\s+/g, '')}`;

                const expenseItem = {
                    userId,
                    transactionId,
                    vendor: `AWS - ${serviceName}`,
                    amount: amount,
                    date: dateToString(today),
                    category: "Hosting",
                    type: "expense",
                    source: "automated_sync",
                    lastSynced: new Date().toISOString()
                };

                await docClient.send(new PutCommand({
                    TableName: process.env.TRANSACTIONS_TABLE,
                    Item: expenseItem
                }));
            }
        }

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN, "Access-Control-Allow-Credentials": true },
            body: JSON.stringify({ message: "Sync complete", count: results.length })
        };

    } catch (e) {
        console.error("Sync Error:", e);
        return { 
            statusCode: 500, 
            headers: { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN },
            body: JSON.stringify({ error: e.message }) 
        };
    }
};