#!/bin/bash

# Script to fix CORS headers in all Lambda functions

# Find all JavaScript files with wildcard CORS
echo "Finding files with wildcard CORS..."
files=$(find ./lambda -name "*.js" -exec grep -l "Access-Control-Allow-Origin.*\*" {} \;)

# Fix each file
for file in $files; do
    echo "Fixing CORS in $file"
    
    # Replace wildcard origin with specific domain
    sed -i "s/'Access-Control-Allow-Origin': '\*'/'Access-Control-Allow-Origin': 'https:\/\/teckstart.com'/g" "$file"
    
    # Replace double quotes too
    sed -i 's/"Access-Control-Allow-Origin": "\*"/"Access-Control-Allow-Origin": "https:\/\/teckstart.com"/g' "$file"
    
    echo "✓ Fixed $file"
done

echo "CORS headers updated in all Lambda functions!"