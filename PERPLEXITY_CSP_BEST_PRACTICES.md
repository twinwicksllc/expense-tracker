# Perplexity AI: CSP Best Practices for CloudFront + S3

**Date:** November 10, 2025  
**Model:** sonar-pro  
**Topic:** Content-Security-Policy configuration for CloudFront distributions

---

## Question

What is the best practice for configuring Content-Security-Policy (CSP) headers for a CloudFront distribution serving a static website from S3? Should I:

A) Add a meta tag in the HTML files  
B) Configure a CloudFront Response Headers Policy  
C) Set headers in S3 bucket metadata  

My application needs to allow connections to:
- API Gateway endpoints
- Cognito endpoints
- S3 buckets for file uploads
- External font CDN

---

## Perplexity's Recommendation

### ✅ **Best Practice: CloudFront Response Headers Policy**

**Verdict:** Configure the CSP header using a CloudFront Response Headers Policy. This is the most secure, reliable, and maintainable approach for static sites served via CloudFront and S3.

---

## Comparison Table

| Approach                         | Security | Coverage                                                         | Maintainability                                                   | Recommended |
|----------------------------------|----------|------------------------------------------------------------------|-------------------------------------------------------------------|-------------|
| **Meta Tag**                     | Low      | HTML only; does not apply to non-HTML resources                  | Easy to add but can be bypassed by client-side code              | ❌ No       |
| **CloudFront Response Headers Policy** | High     | Applies to all responses (HTML, JS, CSS, etc.); cannot be bypassed | Centralized, easy to update via infrastructure-as-code           | ✅ **Yes**  |
| **S3 bucket metadata**           | Medium   | Applies to S3-served content directly                            | Does not cover CloudFront-originated responses; harder to manage | ❌ No       |

---

## Why CloudFront Response Headers Policy?

### Advantages

1. **Security:** Cannot be bypassed by client-side code
2. **Coverage:** Applies to ALL responses (HTML, JS, CSS, images, fonts, etc.)
3. **Centralized:** Single source of truth for security headers
4. **Maintainability:** Easy to update via AWS Console, CLI, or IaC (CDK, Terraform)
5. **Consistency:** Ensures headers are present on all resources including error pages

### Disadvantages of Alternatives

**Meta Tag:**
- ❌ Only applies to HTML files
- ❌ Can be removed or modified by client-side JavaScript
- ❌ Doesn't protect non-HTML resources (JS, CSS, fonts, images)

**S3 Metadata:**
- ❌ Doesn't cover CloudFront-generated responses (error pages, redirects)
- ❌ Harder to manage at scale
- ❌ Not recommended for CSP

---

## Implementation Example

### Updated CSP Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data: https://r2cdn.perplexity.ai;
connect-src 'self' 
  https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com 
  https://cognito-idp.us-east-1.amazonaws.com 
  https://expense-tracker-prod.auth.us-east-1.amazoncognito.com 
  https://expense-tracker-receipts-prod-391907191624.s3.us-east-1.amazonaws.com 
  https://*.s3.us-east-1.amazonaws.com;
frame-ancestors 'none';
```

### AWS CLI Commands

```bash
# 1. Get current policy
aws cloudfront get-response-headers-policy \
  --id 5cb3c520-7004-4253-976f-52df9a00976f \
  --output json > current-policy.json

# 2. Extract ETag
ETAG=$(jq -r '.ETag' current-policy.json)

# 3. Update policy config (edit JSON file)
jq '.ResponseHeadersPolicy.ResponseHeadersPolicyConfig' current-policy.json > policy-config.json

# 4. Update the policy
aws cloudfront update-response-headers-policy \
  --id 5cb3c520-7004-4253-976f-52df9a00976f \
  --if-match "$ETAG" \
  --response-headers-policy-config file://policy-config.json
```

---

## Additional Recommendations

1. **Test in report-only mode first** to avoid breaking your site
2. **Add a report-uri or report-to directive** to collect violation reports
3. **Use infrastructure-as-code** (CDK, Terraform) for repeatable deployments
4. **Combine with other security headers:**
   - Strict-Transport-Security (HSTS)
   - X-Content-Type-Options
   - X-Frame-Options
   - Referrer-Policy

---

## Summary

**For maximum security and maintainability, always use a CloudFront Response Headers Policy to set your CSP header when serving static sites via CloudFront and S3.**

Meta tags are less secure and don't cover all resources. S3 metadata is impractical for CSP management.

---

## References

- Perplexity AI (sonar-pro model)
- AWS CloudFront Documentation
- Content Security Policy (CSP) Specification
