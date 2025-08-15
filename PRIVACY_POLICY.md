# Privacy Policy for Grab OTP

**Last Updated**: August 15, 2025  
**Version**: 1.0.0

## Overview

Grab OTP is a browser extension that automatically retrieves one-time password (OTP) codes from your Gmail account based on the domain of the website you're currently visiting. This privacy policy explains what data we collect, how we use it, and how we protect your privacy.

## Data We Collect

### 1. Gmail Email Content
- **What**: We access your Gmail emails to search for OTP codes
- **Scope**: Only emails from the past 30 minutes from senders matching your current website's domain
- **Purpose**: To extract OTP verification codes for auto-fill functionality
- **Examples**: If you're on "bank.com", we search emails from "@bank.com" for OTP codes

### 2. Current Website Domain
- **What**: The domain of the website you're currently visiting
- **Purpose**: To match with email senders and find relevant OTP codes
- **Access**: Only when you manually click the extension icon (activeTab permission)

### 3. User Preferences
- **What**: Your auto-fill preference setting (enabled/disabled)
- **Storage**: Stored locally in your browser only
- **Purpose**: To remember whether you want automatic OTP filling

## Data We DO NOT Collect

- ❌ Personal information (name, address, phone, etc.)
- ❌ Complete email contents (only OTP codes are extracted)
- ❌ Browsing history
- ❌ Passwords or sensitive account information
- ❌ Data from other websites or applications

## How We Use Your Data

1. **OTP Extraction**: Search recent emails for verification codes
2. **Auto-Fill**: Automatically fill OTP codes into website forms (if enabled)
3. **Clipboard Copy**: Copy OTP codes to your clipboard for manual pasting
4. **Preference Storage**: Remember your auto-fill settings

## Data Storage and Security

### Local Storage Only
- All data processing happens locally in your browser
- No data is transmitted to external servers
- OTP codes are temporarily stored locally and automatically cleared

### Security Measures
- **OAuth 2.0**: Secure authentication with Gmail using Google's official APIs
- **Minimal Permissions**: Only requests access to what's absolutely necessary
- **Input Sanitization**: All data is sanitized to prevent security vulnerabilities
- **No Logging**: Sensitive information is never logged or stored permanently

### Data Retention
- **OTP Codes**: Cleared immediately after use or when popup is closed
- **User Preferences**: Stored until manually cleared or extension is uninstalled
- **OAuth Tokens**: Managed securely by browser's identity system

## Third-Party Services

### Google Gmail API
- **Purpose**: Access your Gmail to search for OTP codes
- **Scope**: `gmail.readonly` - read-only access to your emails
- **Data Shared**: None - we only receive search results, Google does not receive any data from us
- **Privacy**: Subject to [Google's Privacy Policy](https://policies.google.com/privacy)

## Your Rights and Controls

### You Can:
- ✅ Revoke Gmail access at any time through Google Account settings
- ✅ Disable auto-fill functionality in extension preferences
- ✅ Uninstall the extension to remove all local data
- ✅ Use the extension manually without storing any preferences

### How to Revoke Access:
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Navigate to "Third-party apps with account access"
3. Find "Grab OTP" and click "Remove access"

## Browser Permissions Explained

- **activeTab**: Access current website domain only when you click the extension
- **tabs**: Detect the domain of your current website
- **storage**: Store your auto-fill preference locally
- **identity**: Authenticate with Gmail using OAuth 2.0
- **https://www.googleapis.com/***: Communicate with Gmail API

## Children's Privacy

This extension is not intended for use by children under 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has used this extension, please contact us.

## Changes to This Policy

We may update this privacy policy from time to time. When we do:
- We'll update the "Last Updated" date
- Significant changes will be communicated through the extension update process
- Continued use of the extension after changes constitutes acceptance of the new policy

## Contact Information

If you have questions about this privacy policy or our privacy practices:

- **GitHub Issues**: [https://github.com/anthropics/claude-code/issues](https://github.com/anthropics/claude-code/issues)
- **Extension Version**: Check "About" section in extension popup

## Compliance

This extension is designed to comply with:
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)
- Browser extension store policies (Chrome Web Store, Firefox Add-ons)

## Summary

Grab OTP is designed with privacy by default:
- ✅ Local processing only
- ✅ No external data transmission
- ✅ Minimal data collection
- ✅ User-controlled access
- ✅ Secure authentication
- ✅ Transparent operations

Your privacy is our priority. We only access what's necessary to provide the OTP retrieval functionality you requested.