#!/usr/bin/env python3
import json
import subprocess
import sys

def run_command(cmd):
    """Run a shell command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        sys.exit(1)
    return result.stdout

def main():
    distribution_id = "EB9MXBNYV9HVD"
    api_domain = "fcnq8h7mai.execute-api.us-east-1.amazonaws.com"
    
    print("Fetching current CloudFront distribution config...")
    config_json = run_command(f"aws cloudfront get-distribution-config --id {distribution_id}")
    config_data = json.loads(config_json)
    
    dist_config = config_data['DistributionConfig']
    etag = config_data['ETag']
    
    print(f"Current ETag: {etag}")
    
    # Add API Gateway as a new origin
    new_origin = {
        "Id": "API-Gateway-prod",
        "DomainName": api_domain,
        "OriginPath": "/prod",
        "CustomHeaders": {
            "Quantity": 0
        },
        "CustomOriginConfig": {
            "HTTPPort": 80,
            "HTTPSPort": 443,
            "OriginProtocolPolicy": "https-only",
            "OriginSslProtocols": {
                "Quantity": 3,
                "Items": ["TLSv1.2", "TLSv1.1", "TLSv1"]
            },
            "OriginReadTimeout": 30,
            "OriginKeepaliveTimeout": 5
        },
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10,
        "OriginShield": {
            "Enabled": False
        },
        "OriginAccessControlId": ""
    }
    
    # Check if origin already exists
    origin_exists = False
    for origin in dist_config['Origins']['Items']:
        if origin['Id'] == 'API-Gateway-prod':
            origin_exists = True
            print("API Gateway origin already exists, updating...")
            origin.update(new_origin)
            break
    
    if not origin_exists:
        print("Adding new API Gateway origin...")
        dist_config['Origins']['Items'].append(new_origin)
        dist_config['Origins']['Quantity'] = len(dist_config['Origins']['Items'])
    
    # Add cache behavior for /api/* paths
    new_behavior = {
        "PathPattern": "/api/*",
        "TargetOriginId": "API-Gateway-prod",
        "TrustedSigners": {
            "Enabled": False,
            "Quantity": 0
        },
        "TrustedKeyGroups": {
            "Enabled": False,
            "Quantity": 0
        },
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 7,
            "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
            "CachedMethods": {
                "Quantity": 2,
                "Items": ["GET", "HEAD"]
            }
        },
        "SmoothStreaming": False,
        "Compress": True,
        "LambdaFunctionAssociations": {
            "Quantity": 0
        },
        "FunctionAssociations": {
            "Quantity": 0
        },
        "FieldLevelEncryptionId": "",
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",  # CachingDisabled
        "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac"  # AllViewerExceptHostHeader
    }
    
    # Check if behavior already exists
    behavior_exists = False
    if 'Items' in dist_config['CacheBehaviors']:
        for i, behavior in enumerate(dist_config['CacheBehaviors']['Items']):
            if behavior['PathPattern'] == '/api/*':
                behavior_exists = True
                print("API behavior already exists, updating...")
                dist_config['CacheBehaviors']['Items'][i] = new_behavior
                break
    
    if not behavior_exists:
        print("Adding new cache behavior for /api/*...")
        if 'Items' not in dist_config['CacheBehaviors']:
            dist_config['CacheBehaviors']['Items'] = []
        dist_config['CacheBehaviors']['Items'].append(new_behavior)
        dist_config['CacheBehaviors']['Quantity'] = len(dist_config['CacheBehaviors']['Items'])
    
    # Save updated config
    print("Saving updated configuration...")
    with open('/tmp/updated-cf-config.json', 'w') as f:
        json.dump(dist_config, f, indent=2)
    
    # Update CloudFront distribution
    print("Updating CloudFront distribution...")
    update_cmd = f'aws cloudfront update-distribution --id {distribution_id} --distribution-config file:///tmp/updated-cf-config.json --if-match {etag}'
    result = run_command(update_cmd)
    
    print("\n✓ CloudFront distribution updated successfully!")
    print("\nNext steps:")
    print("1. Wait 5-10 minutes for CloudFront to deploy changes")
    print("2. Update frontend to use /api/* instead of direct API Gateway URLs")
    print("3. Test the application")

if __name__ == "__main__":
    main()