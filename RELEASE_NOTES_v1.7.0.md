# Release Notes - v1.7.0

**Release Date:** November 8, 2025  
**Status:** Production Ready ✅  
**Security Review:** Perplexity AI Approved ✅

---

## 🎉 Major Features

### Google Account Linking (Production Ready)
- **Sign in with Google** - Users can now authenticate using their Google account
- **Account Linking** - Link Google account to existing email/password accounts
- **Dual Authentication** - Sign in with either method after linking
- **Seamless Experience** - OAuth flow fully integrated with settings page

### Security Hardening
All security features validated by **Perplexity AI** and approved for production:

- **Token Revocation** - Immediate invalidation on account unlink
- **JWT Verification** - Signature and audience claim validation
- **Rate Limiting** - 5 requests/minute per user
- **Input Validation** - All user inputs sanitized
- **CORS Protection** - Restricted to trusted domain only

---

## 🐛 Bug Fixes

### Critical Fixes
1. **Lambda Function Restoration**
   - Fixed truncated expenses.js (restored 168 missing lines)
   - Restored `deleteExpense` function and `exports.handler`
   - Eliminated 502 errors and "Unexpected end of input"

2. **Settings Page Crashes**
   - Fixed all JavaScript TypeError crashes
   - Added comprehensive null safety checks
   - Implemented page detection (isDashboardPage)
   - Fixed JSON parsing error (removed double parse)

3. **CORS Errors**
   - Fixed link-account endpoint CORS preflight
   - Fixed aws-credentials endpoint CORS
   - Added OPTIONS handlers to all API endpoints

4. **Missing Configuration**
   - Added TRANSACTIONS_TABLE environment variable
   - Added RECEIPTS_BUCKET environment variable
   - Added PROJECTS_TABLE environment variable

---

## 🔒 Security Enhancements

### Token Management
- **DynamoDB Token Denylist** - Tracks revoked tokens with automatic TTL cleanup
- **Immediate Revocation** - Tokens invalidated on unlink/logout
- **JWT Signature Verification** - Uses jwks-rsa for Cognito JWKS validation
- **Audience Claim Validation** - Prevents token misuse across applications

### API Security
- **Rate Limiting** - Prevents abuse (5 req/min per user)
- **Input Validation** - Sanitizes all user inputs
- **Error Message Sanitization** - No information leakage
- **CORS Restriction** - Only allows https://app.twin-wicks.com

---

## 🏗️ Infrastructure Changes

### New Resources
- **DynamoDB Table:** `expense-tracker-token-denylist-prod`
  - Purpose: Track revoked JWT tokens
  - TTL: Automatic cleanup of expired entries
  - Billing: Pay-per-request

- **Lambda Function:** `expense-tracker-prod-unlinkAccount`
  - Purpose: Unlink Google accounts with token revocation
  - Size: 6.6MB (includes all dependencies)
  - Security: Perplexity AI approved

### Updated Resources
- **Lambda:** expense-tracker-prod-link-account
  - Added OPTIONS handler for CORS
  - Updated handler to index.handler
  - Added Lambda permission for API Gateway

- **API Gateway:** fcnq8h7mai
  - Fixed OPTIONS integration for link-account
  - Redeployed to prod stage
  - Added Lambda proxy integration

---

## 📝 Code Quality Improvements

### Frontend
- **Page Detection** - isDashboardPage prevents errors on settings page
- **Null Safety** - All DOM access wrapped in null checks
- **Defensive Coding** - Functions check for element existence before use
- **Event Listeners** - Wrapped in null checks to prevent crashes

### Backend
- **Shared Auth Module** - auth-utils.mjs for JWT verification
- **Consistent CORS** - All endpoints use same CORS headers
- **Error Handling** - Proper try/catch with appropriate status codes
- **Modular Code** - Separated concerns (auth, unlink, link)

---

## 📦 Files Modified

### New Files
- `lambda/index.mjs` - Re-exports link-account handler
- `lambda/unlink-account.mjs` - Production-ready unlink handler
- `lambda/auth-utils.mjs` - Shared JWT verification utilities
- `PERPLEXITY_SECURITY_REVIEW_expenses.js.md` - Security audit
- `PERPLEXITY_FINAL_APPROVAL_unlink.md` - Unlink security approval
- `DEPLOYMENT_SUMMARY_v1.6.6.md` - Deployment documentation
- `SESSION_SUMMARY_2025-11-08.md` - Session notes

### Updated Files
- `lambda/expenses.js` - Restored complete file (692 lines)
- `lambda/aws-credentials.js` - Added OPTIONS handler
- `lambda/package.json` - Added jwks-rsa, jsonwebtoken
- `frontend/app.js` - Comprehensive null safety
- `frontend/settings.js` - Fixed JSON parsing, endpoint URLs

---

## ✅ Testing Results

### Functional Testing
- ✅ Dashboard loads without errors
- ✅ Settings page loads without errors
- ✅ Email/password login works
- ✅ Google sign-in works
- ✅ Account linking works end-to-end
- ✅ Account unlinking works with token revocation
- ✅ Expense CRUD operations work
- ✅ AWS Integration tab loads

### Security Testing
- ✅ JWT signature verification works
- ✅ Token revocation immediate
- ✅ Rate limiting enforced
- ✅ CORS properly restricted
- ✅ Input validation working

### Browser Console
- ✅ No critical JavaScript errors
- ⚠️ Font CSP warning (cosmetic only, doesn't affect functionality)

---

## 🔄 Migration Notes

### For Existing Users
1. **No action required** - All changes are backward compatible
2. **Google Linking** - Optional feature, can link anytime from Settings
3. **Token Revocation** - Existing sessions remain valid until expiration

### For Developers
1. **New Dependencies** - Run `npm install` in lambda directory
2. **Environment Variables** - Ensure all Lambda functions have required env vars
3. **DynamoDB Table** - Token denylist table created automatically
4. **API Gateway** - Redeployed to prod stage

---

## 🚀 Deployment Summary

### Lambda Functions Deployed
- ✅ expense-tracker-prod-getExpenses
- ✅ expense-tracker-prod-createExpense
- ✅ expense-tracker-prod-updateExpense
- ✅ expense-tracker-prod-deleteExpense
- ✅ expense-tracker-prod-link-account
- ✅ expense-tracker-prod-unlinkAccount (new)

### Frontend Deployed
- ✅ app.js (comprehensive null safety)
- ✅ settings.js (fixed JSON parsing)
- ✅ CloudFront cache invalidated

### Infrastructure
- ✅ DynamoDB token-denylist table created
- ✅ API Gateway redeployed to prod
- ✅ Lambda permissions configured

---

## 📊 Known Issues (To Address Later)

As noted by the user, there are still some issues to work on in future releases:

1. **Font CSP Warning** - Cosmetic issue with Perplexity font loading
2. **Potential UI Improvements** - Settings page could be enhanced
3. **Error Handling** - Could be more user-friendly in some areas

These will be addressed in future releases (v1.7.1+).

---

## 🎯 What's Next

### Planned for v1.7.1
- Fix font CSP warning
- Improve error messages
- Add loading states
- Enhanced UI feedback

### Future Enhancements
- Multi-factor authentication
- Account recovery flow
- Advanced token management
- Audit logging

---

## 📚 Documentation

### Security Reviews
- **expenses.js** - Perplexity AI approved for production
- **unlink-account.mjs** - Perplexity AI approved with all recommendations implemented
- **app.js null safety** - Perplexity AI approved for robustness

### Deployment Guides
- DEPLOYMENT_SUMMARY_v1.6.6.md - Comprehensive deployment documentation
- SESSION_SUMMARY_2025-11-08.md - Detailed session notes

---

## 🙏 Credits

**Security Validation:** Perplexity AI  
**Development:** Manus AI  
**Testing:** User feedback and real-world usage

---

## 📞 Support

For issues or questions:
- GitHub Issues: https://github.com/twinwicksllc/expense-tracker/issues
- Documentation: See DEPLOYMENT_SUMMARY and SESSION_SUMMARY files

---

**Version:** 1.7.0  
**Git Tag:** v1.7.0  
**Commit:** 12079c6  
**Release Date:** November 8, 2025
