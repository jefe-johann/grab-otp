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

### Chrome Web Store
*Coming soon - under review*

### Firefox Add-ons
*Coming soon - under review*

### Manual Installation
1. Download the latest release
2. Unzip the extension files
3. Load as unpacked extension in developer mode

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

```bash
# Install dependencies
npm install

# Build for Chrome
npm run build:chrome

# Build for Firefox  
npm run build:firefox

# Type checking
npm run typecheck
```

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