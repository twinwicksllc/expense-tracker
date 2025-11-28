const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });
const s3 = new S3Client({ region: "us-east-1" });

module.exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const { fileKey } = body;
        
        // 1. Get Image from S3
        const getObjCommand = new GetObjectCommand({
            Bucket: process.env.RECEIPTS_BUCKET,
            Key: fileKey
        });
        const s3Response = await s3.send(getObjCommand);
        const imageBuffer = await s3Response.Body.transformToByteArray();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');

        // 2. Construct Bedrock Prompt (Nova Pro / Claude 3)
        // Note: Using Claude 3 Haiku or Sonnet syntax is often safer for immediate availability 
        // if Nova is not whitelisted, but here is the generic multimodal structure.
        const prompt = `
            Analyze this receipt image. Extract the following fields and return ONLY a JSON object:
            - vendor (string): The business name.
            - amount (number): The total amount.
            - date (string): YYYY-MM-DD format.
            - category (string): Choose from [Software, Hosting, Office, Travel, Other].
            - taxDeductible (boolean): True if this looks like a valid business expense.
            
            Return raw JSON only, no markdown formatting.
        `;

        const payload = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1000,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
                        { type: "text", text: prompt }
                    ]
                }
            ]
        };

        // 3. Call Bedrock
        const command = new InvokeModelCommand({
            modelId: "anthropic.claude-3-haiku-20240307-v1:0", // Swapped to Haiku for speed/cost (Nova uses similar invocation)
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(payload)
        });

        const response = await bedrock.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        const aiText = responseBody.content[0].text;
        
        // 4. Clean JSON
        const cleanJson = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanJson);

        return {
            statusCode: 200,
            headers: { 
                "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN,
                "Access-Control-Allow-Credentials": true
            },
            body: JSON.stringify(parsedData)
        };

    } catch (error) {
        console.error("AI Parse Error:", error);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message })
        };
    }
};