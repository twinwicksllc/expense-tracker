const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const PROJECTS_TABLE = process.env.PROJECTS_TABLE || 'expense-tracker-projects-prod';

// Validation helper
function validateProjectName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Project name is required' };
    }
    
    const trimmed = name.trim();
    if (trimmed.length < 1) {
        return { valid: false, error: 'Project name cannot be empty' };
    }
    if (trimmed.length > 120) {
        return { valid: false, error: 'Project name must be 120 characters or less' };
    }
    
    return { valid: true, value: trimmed };
}

// Create Project
async function createProject(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    const body = JSON.parse(event.body);
    
    // Validate project name
    const nameValidation = validateProjectName(body.name);
    if (!nameValidation.valid) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: nameValidation.error })
        };
    }
    
    const projectId = uuidv4();
    const now = new Date().toISOString();
    
    const project = {
        userId,
        projectId,
        name: nameValidation.value,
        description: body.description?.trim().substring(0, 500) || '',
        createdAt: now,
        updatedAt: now,
        isActive: true
    };
    
    await docClient.send(new PutCommand({
        TableName: PROJECTS_TABLE,
        Item: project
    }));
    
    return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
    };
}

// Get All Projects
async function getProjects(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    const includeInactive = event.queryStringParameters?.includeInactive === 'true';
    
    const result = await docClient.send(new QueryCommand({
        TableName: PROJECTS_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        }
    }));
    
    let projects = result.Items || [];
    
    // Filter out inactive projects unless requested
    if (!includeInactive) {
        projects = projects.filter(p => p.isActive !== false);
    }
    
    // Sort by name
    projects.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projects)
    };
}

// Get Single Project
async function getProject(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    const projectId = event.pathParameters.id;
    
    const result = await docClient.send(new GetCommand({
        TableName: PROJECTS_TABLE,
        Key: { userId, projectId }
    }));
    
    if (!result.Item) {
        return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Project not found' })
        };
    }
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.Item)
    };
}

// Update Project
async function updateProject(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    const projectId = event.pathParameters.id;
    const body = JSON.parse(event.body);
    
    // Validate project name if provided
    if (body.name) {
        const nameValidation = validateProjectName(body.name);
        if (!nameValidation.valid) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: nameValidation.error })
            };
        }
        body.name = nameValidation.value;
    }
    
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    if (body.name) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = body.name;
    }
    
    if (body.description !== undefined) {
        updateExpressions.push('description = :description');
        expressionAttributeValues[':description'] = body.description.trim().substring(0, 500);
    }
    
    if (body.isActive !== undefined) {
        updateExpressions.push('isActive = :isActive');
        expressionAttributeValues[':isActive'] = body.isActive;
    }
    
    if (updateExpressions.length === 0) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'No fields to update' })
        };
    }
    
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    const result = await docClient.send(new UpdateCommand({
        TableName: PROJECTS_TABLE,
        Key: { userId, projectId },
        UpdateExpression: 'SET ' + updateExpressions.join(', '),
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    }));
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.Attributes)
    };
}

// Delete Project (soft delete)
async function deleteProject(event) {
    const userId = event.requestContext.authorizer.claims.sub;
    const projectId = event.pathParameters.id;
    
    // Soft delete by setting isActive to false
    await docClient.send(new UpdateCommand({
        TableName: PROJECTS_TABLE,
        Key: { userId, projectId },
        UpdateExpression: 'SET isActive = :false, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
            ':false': false,
            ':updatedAt': new Date().toISOString()
        }
    }));
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Project deleted successfully' })
    };
}

// Main handler
exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        // Decode base64-encoded body if needed
        if (event.isBase64Encoded && event.body) {
            event.body = Buffer.from(event.body, 'base64').toString('utf-8');
            event.isBase64Encoded = false;
        }
        
        const method = event.httpMethod;
        const path = event.path;
        
        // Add CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': 'https://teckstart.com',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        };
        
        if (method === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: ''
            };
        }
        
        let response;
        
        if (method === 'POST' && path === '/projects') {
            response = await createProject(event);
        } else if (method === 'GET' && path === '/projects') {
            response = await getProjects(event);
        } else if (method === 'GET' && path.match(/\/projects\/[^/]+$/)) {
            response = await getProject(event);
        } else if (method === 'PUT' && path.match(/\/projects\/[^/]+$/)) {
            response = await updateProject(event);
        } else if (method === 'DELETE' && path.match(/\/projects\/[^/]+$/)) {
            response = await deleteProject(event);
        } else {
            response = {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Not found' })
            };
        }
        
        // Add CORS headers to response
        response.headers = { ...response.headers, ...corsHeaders };
        return response;
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://teckstart.com'
            },
            body: JSON.stringify({ error: 'Internal server error', message: error.message })
        };
    }
};

