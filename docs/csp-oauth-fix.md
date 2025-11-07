# CSP Fix for OAuth Integration

**Date:** November 7, 2025  
**Issue:** Content Security Policy blocking OAuth token exchange

## Problem

When users clicked "Sign in with Google", they were redirected to Google successfully, but upon callback, the browser blocked the token exchange request with this error:

```
Refused to connect to 'https://expense-tracker-prod.auth.us-east-1.amazoncognito.com/oauth2/token' 
because it violates the following Content Security Policy directive: 
"connect-src 'self' https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com"
```

## Root Cause

The CloudFront Response Headers Policy had a Content Security Policy (CSP) that only allowed connections to:
- `https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com` (API Gateway)
- `https://cognito-idp.us-east-1.amazonaws.com` (Cognito Identity Provider)

But the OAuth flow requires connecting to:
- `https://expense-tracker-prod.auth.us-east-1.amazoncognito.com` (Cognito OAuth domain)

## Solution

Updated the CloudFront Response Headers Policy to add the Cognito OAuth domain to the `connect-src` directive.

### Before
```
connect-src 'self' https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com
```

### After
```
connect-src 'self' https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com https://expense-tracker-prod.auth.us-east-1.amazoncognito.com
```

## Implementation

1. Retrieved current Response Headers Policy configuration:
```bash
aws cloudfront get-response-headers-policy --id 5cb3c520-7004-4253-976f-52df9a00976f
```

2. Updated the CSP to include Cognito OAuth domain

3. Applied the updated policy:
```bash
aws cloudfront update-response-headers-policy \
  --id 5cb3c520-7004-4253-976f-52df9a00976f \
  --response-headers-policy-config file:///tmp/updated-response-headers-policy.json \
  --if-match E23ZP02F085DFQ
```

4. Created CloudFront invalidation to propagate changes:
```bash
aws cloudfront create-invalidation --distribution-id EB9MXBNYV9HVD --paths "/*"
```

## Testing

After the CloudFront invalidation completes (1-2 minutes):
1. Visit https://app.twin-wicks.com
2. Click "Sign in with Google"
3. Authorize with Google
4. Should successfully exchange authorization code for tokens
5. Should be redirected to dashboard

## Notes

- Response Headers Policy ID: `5cb3c520-7004-4253-976f-52df9a00976f`
- Policy Name: `expense-tracker-security-headers`
- CloudFront Distribution ID: `EB9MXBNYV9HVD`
- New ETag: `ETVPDKIKX0DER`

## Security Considerations

The updated CSP maintains security by:
- Only allowing connections to specific, trusted domains
- Not using wildcards
- Keeping all other security headers intact (XSS Protection, Frame Options, etc.)
- Following principle of least privilege

