#!/bin/bash

# Create custom origin request policy that explicitly forwards X-Auth-Token
aws cloudfront create-origin-request-policy \
    --origin-request-policy-config '{
        "Name": "ExpenseTrackerOriginPolicy",
        "Comment": "Forward all headers including X-Auth-Token for Cognito authentication",
        "HeadersConfig": {
            "HeaderBehavior": "allViewer"
        },
        "CookiesConfig": {
            "CookieBehavior": "all"
        },
        "QueryStringsConfig": {
            "QueryStringBehavior": "all"
        }
    }' \
    --output json | jq '{Id: .OriginRequestPolicy.Id, Name: .OriginRequestPolicy.OriginRequestPolicyConfig.Name}'