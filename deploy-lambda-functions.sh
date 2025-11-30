#!/bin/bash

# Script to deploy all updated Lambda functions with fixed CORS headers

echo "Starting deployment of all Lambda functions with CORS fixes..."

# List of function directories to deploy
FUNCTION_DIRS=(
    "expense-tracker-prod-createExpense"
    "expense-tracker-prod-updateExpense" 
    "expense-tracker-prod-deleteExpense"
    "expense-tracker-prod-getExpense"
    "expense-tracker-prod-getDashboard"
    "expense-tracker-prod-projects"
)

# Deploy each function
for dir in "${FUNCTION_DIRS[@]}"; do
    echo "Deploying $dir..."
    
    # Create zip file
    cd "$dir" && zip -r function.zip *.js
    
    # Extract function name from directory name
    function_name="$dir"
    
    # Deploy to Lambda
    aws lambda update-function-code --function-name "$function_name" --zip-file fileb://function.zip
    
    echo "✓ Deployed $function_name"
    
    # Go back to parent directory
    cd ..
done

echo "All Lambda functions deployed with CORS fixes!"