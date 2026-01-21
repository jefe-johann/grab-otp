# Grab OTP

A cross-browser WebExtension that automatically retrieves OTP codes from Gmail based on the active website's domain.

## Features

- 🔐 **Auto OTP Detection** - Finds verification codes in Gmail emails matching your current website
- 📋 **Clipboard Copy** - Automatically copies OTP codes to clipboard  
- ⚡ **Auto-Fill** - Fills OTP codes directly into website forms (Chrome)
- 🛡️ **Security First** - Minimal permissions, OAuth 2.0, no sensitive data logging
- 🌐 **Cross-Browser** - Works on Chrome and Firefox

## How It Works

1. Visit a website (e.g., bank.com)
2. Click the extension icon
3. Extension searches Gmail for recent emails from @bank.com
4. Extracts OTP codes and copies to clipboard
5. Auto-fills into website forms (where supported)

## Installation

### From Source (Recommended)

**Prerequisites:**
- Node.js 18+ (Node.js 22 LTS recommended)
- npm (comes with Node.js)

**Build Steps:**
```bash
# Clone the repository
git clone https://github.com/jefe-johann/grab-otp.git
cd grab-otp

# Install dependencies
npm install

# Build for your browser
npm run build:chrome   # For Chrome/Edge/Brave
npm run build:firefox  # For Firefox
```

**Loading in Chrome:**
1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `dist/chrome` directory

**Loading in Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Navigate to `dist/firefox` and select `manifest.json`

**Note:** Firefox temporary extensions are removed when the browser closes. For persistent installation, use `web-ext` to create a signed `.xpi` file.

### From GitHub Releases
1. Download the latest release from [Releases](https://github.com/jefe-johann/grab-otp/releases)
2. Unzip the extension files
3. Follow the browser-specific loading instructions above

## Privacy & Security

- **Local Processing**: All OTP extraction happens in your browser
- **Minimal Permissions**: Only accesses what's necessary
- **OAuth 2.0**: Secure Gmail authentication via Google
- **No Data Collection**: Extension doesn't collect or transmit personal data

See [Privacy Policy](PRIVACY_POLICY.md) for full details.

## Browser Support

| Feature | Chrome | Firefox |
|---------|--------|---------|
| OTP Detection | ✅ | ✅ |
| Clipboard Copy | ✅ | ✅ |
| Auto-Fill | ✅ | ⚠️ Limited |
| Badge Notifications | ✅ | ✅ |

## Development

**Environment Setup:**
```bash
# Install dependencies
npm install

# Build commands
npm run build         # Build both Chrome and Firefox versions
npm run build:chrome  # Build Chrome version only
npm run build:firefox # Build Firefox version only

# Development
npm run dev          # Watch mode for development

# Quality checks
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint code linting
npm run test         # Run test suite
```

**OAuth Setup:**
For full functionality, you'll need to set up OAuth credentials:
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Gmail API
3. Create OAuth 2.0 credentials (Web application)
4. Set authorized redirect URIs based on your browser extension ID
5. Update manifest files with your client IDs

**Project Structure:**
- `src/` - TypeScript source code
- `dist/chrome/` - Built Chrome extension
- `dist/firefox/` - Built Firefox extension
- `docs/` - Documentation and development notes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test on both Chrome and Firefox
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 🐛 [Report Issues](https://github.com/jefe-johann/grab-otp/issues)
- 💡 [Feature Requests](https://github.com/jefe-johann/grab-otp/issues/new)