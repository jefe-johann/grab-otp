# Firefox Add-on Submission Notes

**Extension Name**: Grab OTP  
**Version**: 1.0.0  
**Manifest Version**: 2  
**Submission Date**: August 15, 2025

## For Mozilla Review Team

This document provides detailed technical justification for all permissions requested by the Grab OTP extension to assist in the review process.

## Permission Justifications

### 1. `activeTab` Permission
**Purpose**: Access current website's domain to match with email senders  
**Usage**: Only activated when user manually clicks extension icon  
**Security**: 
- No persistent access to website content
- Only reads domain/hostname, not page content
- User-initiated trigger only
- No background monitoring of tabs

**Code Implementation**: `src/popup/popup-firefox.ts:25-35`

### 2. `tabs` Permission  
**Purpose**: Query active tab information to determine current website domain  
**Usage**: `browser.tabs.query({active: true, currentWindow: true})`  
**Security**:
- Only accesses tab URL for domain extraction
- No access to tab content or browsing history
- Used in conjunction with activeTab for domain matching
- No persistent tab monitoring

**Code Implementation**: `src/popup/popup-firefox.ts:27`

### 3. `storage` Permission
**Purpose**: Store user preferences and temporary OTP results  
**Data Stored**:
- Auto-fill preference (boolean): user's choice for automatic OTP insertion
- Temporary OTP results: cleared after popup viewing
- No sensitive data or credentials stored
**Security**:
- All storage is local to user's browser
- No data synchronization across devices
- Automatic cleanup of temporary data
- User can clear all data by uninstalling extension

**Code Implementation**: `src/background/background-firefox.ts:45-60`

### 4. `identity` Permission
**Purpose**: OAuth 2.0 authentication with Gmail API  
**Usage**: `browser.identity.launchWebAuthFlow()`  
**Security**:
- Uses Google's official OAuth 2.0 flow
- Only requests `gmail.readonly` scope
- No access to user credentials (handled by Google)
- Tokens managed securely by browser identity system
- User can revoke access through Google Account settings

**Code Implementation**: `src/background/background-firefox.ts:15-25`

### 5. `https://www.googleapis.com/*` Permission
**Purpose**: Communicate with Gmail API to search for OTP codes  
**Specific Endpoints Used**:
- `https://www.googleapis.com/gmail/v1/users/me/messages` - Search emails
- `https://www.googleapis.com/gmail/v1/users/me/messages/{id}` - Retrieve email content
**Security**:
- Read-only access via `gmail.readonly` scope
- Only searches emails from past 30 minutes
- Only accesses emails matching current website domain
- No modification of emails or Gmail account

**Code Implementation**: `src/background/background-firefox.ts:85-120`

## Security Architecture

### Privacy by Design
- **Local Processing**: All OTP extraction happens locally in browser
- **No External Servers**: Extension communicates only with Google's Gmail API
- **Minimal Data Access**: Only accesses what's necessary for functionality
- **User Control**: All actions require user initiation (clicking extension icon)

### Data Flow Security
1. User clicks extension → `activeTab` permission activated
2. Extension reads current domain → `tabs` permission for URL
3. User authorizes Gmail access → `identity` permission for OAuth
4. Extension searches recent emails → Gmail API permission
5. OTP extracted locally → `storage` permission for temporary result
6. User views result → data cleared automatically

### Content Script Security
**File**: `src/content/content.ts`  
**Purpose**: Clipboard operations for Firefox compatibility  
**Injection**: Only when user explicitly requests clipboard copy  
**Access**: No persistent access to page content  
**Security**: Programmatic injection with activeTab permission

## Firefox-Specific Implementation

### Fire-and-Forget Architecture
- Background script uses badge notifications instead of popup persistence
- Solves OAuth flow interruption issues specific to Firefox
- Results stored temporarily with visual badge indicator
- Auto-cleanup after user views results

### Manifest V2 Compatibility
- Uses event pages (`"persistent": false`) for efficient resource usage
- Compatible with Firefox's security model
- Follows Mozilla's recommended practices for WebExtensions

### Cross-Origin Resource Sharing
- Only communicates with Google APIs (googleapis.com domain)
- No third-party API calls or external services
- All external communications are read-only operations

## Code Security Measures

### Input Sanitization
```typescript
// All email content is sanitized before processing
const sanitizedContent = DOMPurify.sanitize(emailContent);
```

### Error Handling
```typescript
// Comprehensive error handling prevents information leakage
try {
  // API operations
} catch (error) {
  console.error('Operation failed:', error.message); // No sensitive data logged
}
```

### No Sensitive Logging
- Production build removes all debug logging
- Error messages do not expose sensitive information
- OAuth tokens never logged or stored in code

## User Experience & Transparency

### Clear User Consent
- Extension requires explicit user action (clicking icon)
- OAuth flow clearly shows requested Gmail permissions
- Users can disable auto-fill while keeping basic functionality

### Progressive Enhancement
- Works without auto-fill for security-conscious users
- Clipboard copy as fallback to form filling
- No hidden background operations

### Easy Revocation
- Users can revoke Gmail access through Google Account settings
- Extension gracefully handles revoked permissions
- Uninstalling extension removes all local data

## Testing & Quality Assurance

### Security Testing
- ✅ No XSS vulnerabilities in content injection
- ✅ No CSRF issues in API communications  
- ✅ Proper OAuth token handling
- ✅ Input sanitization for all user data
- ✅ No sensitive data exposure in console logs

### Browser Compatibility
- ✅ Tested on Firefox 91.0+ (minimum version specified)
- ✅ Works with Firefox's enhanced security settings
- ✅ Compatible with container tabs and private browsing
- ✅ Handles Firefox's strict content security policies

## Reviewer Notes

### Common Review Concerns Addressed

1. **"Why both `activeTab` and `tabs`?"**
   - `activeTab` provides secure access to current page
   - `tabs` enables domain extraction without full tab content access
   - This combination provides minimal necessary permissions

2. **"Gmail API access seems broad"**
   - Only uses `gmail.readonly` scope (read-only)
   - Searches limited to past 30 minutes
   - Filters by sender domain matching current website
   - No email modification or account changes

3. **"Content script injection concerns"**
   - Injection only on user request (clipboard copy)
   - Uses programmatic injection with activeTab permission
   - No persistent content scripts
   - No access to sensitive page data

### Testing Instructions for Reviewers

1. **Install Extension**: Load from `web-ext-artifacts/grab-otp-firefox.zip`
2. **Test OAuth**: Click extension → should prompt for Gmail permission
3. **Test Domain Matching**: Visit a website, check extension extracts correct domain
4. **Test OTP Extraction**: Send test email with OTP code, verify extraction
5. **Test Privacy**: Verify no data transmission beyond Google APIs
6. **Test Cleanup**: Close popup, verify temporary data is cleared

## Contact for Review Questions

- **Source Code**: Available in submission package
- **Documentation**: See PRIVACY_POLICY.md for user-facing privacy information
- **Support**: GitHub issues for technical questions

---

**For Mozilla Reviewers**: This extension has been thoroughly security audited and follows all Firefox Add-on policies. All permissions are justified and minimal for the stated functionality. The codebase is available for complete review, and we're happy to provide additional clarification on any aspect of the implementation.