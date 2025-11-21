#!/bin/bash

cd lambda

# List of Lambda functions that need dependencies
FUNCTIONS=(
    "expense-tracker-prod-getExpenses"
    "expense-tracker-prod-createExpense"
    "expense-tracker-prod-updateExpense"
    "expense-tracker-prod-deleteExpense"
    "expense-tracker-prod-getExpense"
    "expense-tracker-prod-projects"
    "expense-tracker-prod-getDashboard"
)

echo "Fixing Lambda functions with dependencies..."
echo "============================================"

for FUNC in "${FUNCTIONS[@]}"; do
    echo ""
    echo "Processing $FUNC..."
    
    if [ ! -d "$FUNC" ]; then
        echo "  ⚠ Directory not found, skipping"
        continue
    fi
    
    cd "$FUNC"
    
    # Create package.json if it doesn't exist
    if [ ! -f "package.json" ]; then
        echo "  Creating package.json..."
        cat > package.json << 'EOF'
{
  "name": "expense-tracker-lambda",
  "version": "1.0.0",
  "dependencies": {
    "uuid": "^9.0.0",
    "lambda-multipart-parser": "^1.0.1"
  }
}
EOF
    fi
    
    # Install dependencies
    echo "  Installing dependencies..."
    npm install --production --silent 2>&1 | grep -v "npm warn"
    
    # Find the main JS file
    MAIN_FILE=$(ls *.js 2>/dev/null | grep -v "test" | head -1)
    
    if [ -z "$MAIN_FILE" ]; then
        echo "  ⚠ No JS file found, skipping"
        cd ..
        continue
    fi
    
    # Create deployment package
    echo "  Creating deployment package..."
    zip -r "${FUNC}-fixed.zip" "$MAIN_FILE" node_modules/ -q
    
    # Update Lambda function
    echo "  Updating Lambda function..."
    aws lambda update-function-code \
        --function-name "$FUNC" \
        --zip-file "fileb://${FUNC}-fixed.zip" \
        --output json > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Updated $FUNC"
    else
        echo "  ✗ Failed to update $FUNC"
    fi
    
    cd ..
done

echo ""
echo "============================================"
echo "✓ All Lambda functions updated!"
echo ""
echo "Waiting 5 seconds for functions to become active..."
sleep 5

echo ""
echo "Testing API Gateway..."
curl -s https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod/expenses | python3 -m json.tool