const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");

const s3 = new S3Client({ region: "us-east-1" });

module.exports.handler = async (event) => {
    const body = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;
    const fileKey = `${userId}/${crypto.randomUUID()}-${body.fileName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.RECEIPTS_BUCKET,
        Key: fileKey,
        ContentType: body.fileType
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN, "Access-Control-Allow-Credentials": true },
        body: JSON.stringify({ uploadUrl, key: fileKey })
    };
};