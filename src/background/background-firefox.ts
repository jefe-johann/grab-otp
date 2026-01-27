// Firefox background script - uses global browser from polyfill
import { checkForUpdates } from '../shared/version-check';
import { generateCodeVerifier, generateCodeChallenge, exchangeCodeForTokens, refreshAccessToken } from '../shared/pkce';

declare const browser: any;
declare const __FIREFOX_CLIENT_ID__: string;
declare const __FIREFOX_CLIENT_SECRET__: string;

interface FetchOTPMessage {
  action: 'fetchOTP';
  domain: string;
  autoFill?: boolean;
  timestamp: number;
}

interface OTPResponse {
  success: boolean;
  otp?: string;
  error?: string;
}

interface GmailMessage {
  id: string;
  snippet: string;
}

interface GmailSearchResponse {
  messages?: GmailMessage[];
}

interface GmailMessageResponse {
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<{
      body: { data: string };
      mimeType: string;
    }>;
    body?: { data: string };
  };
  snippet: string;
}

class FirefoxGmailOTPFetcher {
  // Port connections for bridges (tab ID -> port)
  private activePorts = new Map<number, any>();
  
  private readonly OTP_PATTERNS = [
    /\b(\d{6})\b/g,           // 6-digit codes
    /\b(\d{4})\b/g,           // 4-digit codes  
    /\b(\d{8})\b/g,           // 8-digit codes
    /verification code[:\s]*(\d+)/gi,
    /your code[:\s]*(\d+)/gi,
    /otp[:\s]*(\d+)/gi,
    /pin[:\s]*(\d+)/gi
  ];

  // Fire-and-forget OTP fetch with full background processing
  async processOTPRequest(domain: string, requestTimestamp: number, autoFill: boolean = false, tabId?: number): Promise<void> {
    console.log(`Starting OTP fetch for domain: ${domain}, autoFill: ${autoFill}`);
    
    try {
      const result = await this.fetchOTPForDomain(domain);
      
      if (result.success && result.otp) {
        if (autoFill && tabId) {
          // Try auto-fill via bridge first
          const port = this.activePorts.get(tabId);
          if (port) {
            console.log('[Firefox Background] Sending OTP to bridge for auto-fill');
            port.postMessage({ action: 'fillOTP', otp: result.otp });
            
            // Always copy to clipboard as backup, even when auto-filling
            await this.copyToClipboard(result.otp);
            
            await this.showPopupWithResult({
              success: true,
              otp: result.otp,
              domain: domain,
              message: `OTP: ${result.otp} (auto-filled & copied)`
            });
          } else {
            console.log('[Firefox Background] No bridge port found, falling back to clipboard');
            // Fall back to clipboard if no bridge
            await this.copyToClipboard(result.otp);
            await this.showPopupWithResult({
              success: true,
              otp: result.otp,
              domain: domain,
              message: `OTP: ${result.otp} (copied to clipboard - auto-fill failed)`
            });
          }
        } else {
          // Copy to clipboard (original behavior)
          await this.copyToClipboard(result.otp);
          await this.showPopupWithResult({
            success: true,
            otp: result.otp,
            domain: domain,
            message: `OTP: ${result.otp} (copied to clipboard)`
          });
        }
        
        
        console.log('OTP found and copied successfully');
      } else {
        // Show popup with error result
        await this.showPopupWithResult({
          success: false,
          domain: domain,
          message: result.error || `No OTP found in recent emails for ${domain}`
        });
        
        
        console.log(`No OTP found: ${result.error}`);
      }
    } catch (error) {
      console.error('Error in OTP processing:', error);
      const errorMessage = (error as Error).message;
      
      // Show popup with error result
      await this.showPopupWithResult({
        success: false,
        domain: domain,
        message: `Error: ${errorMessage}`
      });
      
    }
  }


  private async fetchOTPForDomain(domain: string): Promise<OTPResponse> {
    try {
      // Always get fresh token for security - let browser handle caching
      console.log('Getting access token...');
      const token = await this.getAccessToken();
      if (!token) {
        return { success: false, error: 'Gmail authentication required' };
      }

      const messages = await this.searchGmailMessages(token, domain);
      if (!messages || messages.length === 0) {
        return { success: false, error: `No recent emails found for ${domain}` };
      }

      for (const message of messages.slice(0, 5)) {
        const messageDetail = await this.getMessageDetail(token, message.id);
        const otp = this.extractOTP(messageDetail);
        
        if (otp) {
          return { success: true, otp };
        }
      }

      return { success: false, error: 'No OTP found in recent emails' };
    } catch (error) {
      console.error('Error fetching OTP:', error);
      
      // If it's an auth error, clear token cache and suggest re-authentication
      if (error instanceof Error && error.message.includes('401')) {
        console.log('Authentication expired, clearing token cache');
        await this.clearTokenCache();
        return { success: false, error: 'Authentication expired - please try again' };
      }
      
      return { success: false, error: (error as Error).message };
    }
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      // Firefox clipboard via programmatic injection (activeTab permission)
      const results = await browser.tabs.query({active: true, currentWindow: true});
      if (results.length > 0 && results[0].id) {
        try {
          // Programmatic injection of clipboard helper
          const clipboardResult = await browser.tabs.executeScript(results[0].id, {
            code: `
              (function() {
                const text = '${text.replace(/[\\'"`]/g, '')}'; // Sanitize
                
                // Validate OTP format
                if (!/^\\d{4,8}$/.test(text)) {
                  return 'invalid_format';
                }
                
                // Try modern clipboard API first
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(text).then(() => {
                    console.log('Clipboard copy successful (modern API)');
                  }).catch(err => {
                    console.log('Modern clipboard API failed:', err);
                  });
                  return 'modern_api_attempted';
                }
                
                // Fallback to execCommand
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '-9999px';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textarea);
                
                return success ? 'execCommand_success' : 'execCommand_failed';
              })();
            `
          });
          
          console.log('Programmatic clipboard injection result:', clipboardResult);
          return;
        } catch (error) {
          console.log('Programmatic injection failed:', error);
          // If we can't inject, we'll just proceed without clipboard copy
        }
      }

      console.warn('No active tab found for clipboard operations');
      
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Don't throw - we still want to show the notification
    }
  }

  private async showPopupWithResult(result: {
    success: boolean;
    otp?: string;
    domain: string;
    message: string;
  }): Promise<void> {
    try {
      console.log('Storing result and updating badge');
      
      // Store the result for the popup to display
      await browser.storage.local.set({
        'latest_otp_result': {
          ...result,
          timestamp: Date.now()
        }
      });
      
      // Badge notifications disabled - auto-fill + popup polling provides immediate feedback
      // if (result.success) {
      //   await browser.browserAction.setBadgeText({ text: '✓' });
      //   await browser.browserAction.setBadgeBackgroundColor({ color: '#4CAF50' });
      //   await browser.browserAction.setTitle({ 
      //     title: `OTP Ready: ${result.otp} (click to view)` 
      //   });
      // } else {
      //   await browser.browserAction.setBadgeText({ text: '✗' });
      //   await browser.browserAction.setBadgeBackgroundColor({ color: '#F44336' });
      //   await browser.browserAction.setTitle({ 
      //     title: 'OTP Error (click to view)' 
      //   });
      // }
      
      console.log('Result stored for popup polling');
    } catch (error) {
      console.error('Failed to store result:', error);
      
      // Fallback: try to store without badge updates
      try {
        await browser.storage.local.set({
          'latest_otp_result': {
            ...result,
            timestamp: Date.now()
          }
        });
        console.log('Result stored via fallback');
      } catch (storageError) {
        console.error('Complete storage failure:', storageError);
      }
    }
  }



  private async getAccessToken(interactive: boolean = true): Promise<string | null> {
    try {
      // Step 1: Check for cached access token
      const cached = await this.getCachedToken();
      if (cached) {
        console.log('Using cached OAuth access token');
        return cached;
      }

      // Step 2: Try to refresh using stored refresh token (no user interaction needed!)
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        console.log('Firefox OAuth: Token refreshed successfully - no user interaction needed');
        return refreshed;
      }

      // Step 3: Try silent auth using Google session cookies
      if (interactive) {
        console.log('Firefox OAuth: Attempting silent authentication...');
        const silentToken = await this.attemptSilentAuth();
        if (silentToken) {
          console.log('Firefox OAuth: Silent auth succeeded - no user interaction needed');
          return silentToken;
        }
        console.log('Firefox OAuth: Silent auth failed, falling back to interactive PKCE flow');
      }

      // Step 4: Full interactive PKCE flow (gets refresh token for future use)
      if (!interactive) {
        return null;
      }

      return await this.performPKCEAuth();
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  /**
   * Perform full PKCE OAuth flow - this gets us a refresh token for long-lived access
   */
  private async performPKCEAuth(): Promise<string | null> {
    console.log('Firefox OAuth: Starting PKCE authentication flow...');

    const firefoxClientId = __FIREFOX_CLIENT_ID__;
    const redirectUri = browser.identity.getRedirectURL();
    const scope = 'https://www.googleapis.com/auth/gmail.readonly';

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    console.log('Firefox native redirect URI:', redirectUri);
    console.log('PKCE challenge generated');

    const params = new URLSearchParams({
      client_id: firefoxClientId,
      response_type: 'code',  // Authorization code flow (not implicit)
      redirect_uri: redirectUri,
      scope: scope,
      access_type: 'offline',  // Request refresh token
      prompt: 'consent',  // Force consent to ensure refresh token is issued
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/auth?${params}`;
    console.log('PKCE auth URL configured');

    console.log('Launching PKCE auth flow...');
    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    console.log('OAuth response received:', responseUrl ? 'Success' : 'Failed');

    if (responseUrl) {
      // Parse authorization code from URL query params
      const url = new URL(responseUrl);
      const code = url.searchParams.get('code');

      if (code) {
        console.log('Authorization code received, exchanging for tokens...');

        // Exchange code for tokens using PKCE (Google requires client_secret for Web Application types)
        const firefoxClientSecret = __FIREFOX_CLIENT_SECRET__;
        const tokens = await exchangeCodeForTokens(code, codeVerifier, firefoxClientId, redirectUri, firefoxClientSecret);

        if (tokens) {
          console.log('Token exchange successful, refresh_token:', tokens.refresh_token ? 'received' : 'not received');

          // Cache the access token
          await this.cacheToken(tokens.access_token, tokens.expires_in);

          // Store refresh token for long-lived access (this is the key!)
          if (tokens.refresh_token) {
            await this.storeRefreshToken(tokens.refresh_token);
            console.log('Refresh token stored for future sessions');
          }

          return tokens.access_token;
        }
      }
    }

    console.log('PKCE auth flow failed');
    return null;
  }

  /**
   * Try to get a new access token using stored refresh token
   * This is the key to avoiding re-auth prompts!
   */
  private async tryRefreshToken(): Promise<string | null> {
    try {
      const result = await browser.storage.local.get(['oauth_refresh_token']);
      const refreshToken = result.oauth_refresh_token;

      if (!refreshToken) {
        console.log('No refresh token stored');
        return null;
      }

      console.log('Attempting to refresh access token...');
      const firefoxClientId = __FIREFOX_CLIENT_ID__;
      const tokens = await refreshAccessToken(refreshToken, firefoxClientId);

      if (tokens) {
        console.log('Token refresh successful');
        await this.cacheToken(tokens.access_token, tokens.expires_in);
        return tokens.access_token;
      }

      // Refresh token may have been revoked, clear it
      console.log('Refresh token invalid, clearing stored token');
      await browser.storage.local.remove(['oauth_refresh_token']);
      return null;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return null;
    }
  }

  /**
   * Silent auth fallback using Google session cookies (original approach)
   */
  private async attemptSilentAuth(): Promise<string | null> {
    try {
      const firefoxClientId = __FIREFOX_CLIENT_ID__;
      const redirectUri = browser.identity.getRedirectURL();
      const scope = 'https://www.googleapis.com/auth/gmail.readonly';

      const params = new URLSearchParams({
        client_id: firefoxClientId,
        response_type: 'token',
        redirect_uri: redirectUri,
        scope: scope,
        prompt: 'none'  // Explicitly request no UI
      });

      const authUrl = `https://accounts.google.com/o/oauth2/auth?${params}`;

      // Try non-interactive flow - uses existing Google session cookies
      const responseUrl = await browser.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: false
      });

      if (responseUrl) {
        const urlFragment = responseUrl.split('#')[1];
        if (urlFragment) {
          const urlParams = new URLSearchParams(urlFragment);
          const token = urlParams.get('access_token');
          const expiresIn = urlParams.get('expires_in');

          if (token) {
            await this.cacheToken(token, expiresIn ? parseInt(expiresIn) : 3600);
            return token;
          }
        }
      }

      return null;
    } catch (error) {
      // Silent auth failure is expected if no valid session - not an error
      console.log('Silent auth not available:', (error as Error).message);
      return null;
    }
  }

  private async getCachedToken(): Promise<string | null> {
    try {
      const result = await browser.storage.local.get(['oauth_token', 'oauth_expires']);
      const token = result.oauth_token;
      const expires = result.oauth_expires;

      if (token && expires && Date.now() < expires) {
        return token;
      }

      // Token expired or doesn't exist
      if (token) {
        console.log('Cached access token expired');
      }

      return null;
    } catch (error) {
      console.error('Error reading cached token:', error);
      return null;
    }
  }

  private async cacheToken(token: string, expiresInSeconds: number): Promise<void> {
    try {
      // Cache token with 5-minute buffer before expiration
      const expiresAt = Date.now() + ((expiresInSeconds - 300) * 1000);
      await browser.storage.local.set({
        oauth_token: token,
        oauth_expires: expiresAt
      });
      console.log('OAuth access token cached successfully');
    } catch (error) {
      console.error('Error caching token:', error);
    }
  }

  private async storeRefreshToken(refreshToken: string): Promise<void> {
    try {
      await browser.storage.local.set({
        oauth_refresh_token: refreshToken
      });
      console.log('OAuth refresh token stored');
    } catch (error) {
      console.error('Error storing refresh token:', error);
    }
  }

  private async clearTokenCache(): Promise<void> {
    try {
      await browser.storage.local.remove(['oauth_token', 'oauth_expires']);
      console.log('OAuth access token cache cleared');
    } catch (error) {
      console.error('Error clearing token cache:', error);
    }
  }

  private async searchGmailMessages(token: string, domain: string): Promise<GmailMessage[]> {
    const query = `from:${domain} OR from:@${domain} newer_than:30m`;
    const url = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('401 Unauthorized - token expired');
      }
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data: GmailSearchResponse = await response.json();
    return data.messages || [];
  }

  private async getMessageDetail(token: string, messageId: string): Promise<GmailMessageResponse> {
    const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('401 Unauthorized - token expired');
      }
      throw new Error(`Gmail API error: ${response.status}`);
    }

    return await response.json();
  }

  private extractOTP(message: GmailMessageResponse): string | null {
    const textContent = this.getMessageTextContent(message);
    
    for (const pattern of this.OTP_PATTERNS) {
      const matches = textContent.match(pattern);
      if (matches) {
        // Return the first match that looks like an OTP
        for (const match of matches) {
          const code = match.replace(/\D/g, ''); // Extract only digits
          if (code.length >= 4 && code.length <= 8) {
            return code;
          }
        }
      }
    }
    
    return null;
  }

  private getMessageTextContent(message: GmailMessageResponse): string {
    let content = message.snippet || '';
    
    // Try to get the full message body
    if (message.payload.body?.data) {
      content += ' ' + this.decodeBase64(message.payload.body.data);
    }
    
    // Check message parts for text content
    if (message.payload.parts) {
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
          content += ' ' + this.decodeBase64(part.body.data);
        }
      }
    }
    
    return content;
  }

  private decodeBase64(data: string): string {
    try {
      // Gmail API returns base64url encoded data
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(escape(atob(base64)));
    } catch (error) {
      console.error('Error decoding base64 data:', error);
      return '';
    }
  }

  private async injectAndFillOTP(otp: string): Promise<void> {
    try {
      console.log('Attempting to inject and fill OTP (' + otp.length + ' digits)');
      
      // Get the active tab
      const results = await browser.tabs.query({active: true, currentWindow: true});
      if (results.length === 0 || !results[0].id) {
        throw new Error('No active tab found for auto-fill');
      }

      const tabId = results[0].id;

      // Inject the OTP auto-fill content script
      await browser.tabs.executeScript(tabId, {
        file: 'otp-autofill.js'
      });

      // Call the fillOTP function
      const fillResult = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            const otpCode = '${otp.replace(/[\\'"`]/g, '')}'; // Sanitize
            
            // Validate OTP format
            if (!/^\\d{4,8}$/.test(otpCode)) {
              return { success: false, error: 'invalid_format' };
            }
            
            if (typeof window.fillOTP === 'function') {
              return window.fillOTP(otpCode).then(success => ({ success }));
            } else {
              return { success: false, error: 'fillOTP_function_not_available' };
            }
          })();
        `
      });

      console.log('OTP auto-fill injection result:', fillResult);
      
      // Check if the result indicates success
      if (!fillResult || !fillResult[0]?.success) {
        throw new Error('Auto-fill function returned false or failed');
      }

      console.log('OTP auto-fill completed successfully');
    } catch (error) {
      console.error('Failed to inject and fill OTP:', error);
      throw error;
    }
  }

  // Port management methods
  addBridgePort(tabId: number, port: any): void {
    this.activePorts.set(tabId, port);
    console.log('[Firefox Background] Bridge port added for tab:', tabId);
  }

  removeBridgePort(tabId: number): void {
    this.activePorts.delete(tabId);
    console.log('[Firefox Background] Bridge port removed for tab:', tabId);
  }

  getBridgePort(tabId: number): any {
    return this.activePorts.get(tabId);
  }
}

const firefoxOtpFetcher = new FirefoxGmailOTPFetcher();

// Long-lived port connection handler
browser.runtime.onConnect.addListener((port: any) => {
  if (port.name === 'firefoxOtpBridge') {
    console.log('[Firefox Background] Bridge connected from tab:', port.sender?.tab?.id);
    
    if (port.sender?.tab?.id) {
      firefoxOtpFetcher.addBridgePort(port.sender.tab.id, port);
      
      port.onDisconnect.addListener(() => {
        console.log('[Firefox Background] Bridge disconnected from tab:', port.sender?.tab?.id);
        if (port.sender?.tab?.id) {
          firefoxOtpFetcher.removeBridgePort(port.sender.tab.id);
        }
      });
      
      // Handle messages from bridge
      port.onMessage.addListener((message: any) => {
        if (message.action === 'fillResult') {
          console.log('[Firefox Background] Bridge fill result:', message.success ? 'Success' : 'Failed');
        }
      });
    }
  }
});

// Enhanced message handler
browser.runtime.onMessage.addListener(async (message: any, sender: any, sendResponse: any) => {
  if (message.action === 'injectBridge') {
    // Immediately inject bridge on user interaction
    try {
      console.log('[Firefox Background] Injecting bridge for tab:', message.tabId);
      await injectBridgeScript(message.tabId);
      return { success: true };
    } catch (error) {
      console.error('[Firefox Background] Bridge injection failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }
  
  if (message.action === 'fetchOTP') {
    // Process in background without blocking the message response
    firefoxOtpFetcher.processOTPRequest(message.domain, message.timestamp, message.autoFill || false, message.tabId);
    // Return immediately (no response needed)
    return;
  }
  
  if (message.action === 'sendOTPToBridge') {
    // Forward OTP to bridge via port
    const port = firefoxOtpFetcher.getBridgePort(message.tabId);
    if (port) {
      console.log('[Firefox Background] Forwarding OTP to bridge');
      port.postMessage({ action: 'fillOTP', otp: message.otp });
    } else {
      console.log('[Firefox Background] No bridge port found for tab:', message.tabId);
    }
    return;
  }
});

// Feature detection for injection API with separate bridge file
async function injectBridgeScript(tabId: number): Promise<void> {
  // Validate tab permissions before injection
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('moz-extension://')) {
      throw new Error('Cannot inject into system pages');
    }
  } catch (error) {
    throw new Error('Invalid tab or insufficient permissions');
  }
  
  // Feature detection: prefer scripting API, fallback to tabs
  if (browser.scripting && browser.scripting.executeScript) {
    console.log('[Firefox Background] Using modern scripting API');
    await browser.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['otp-bridge-firefox.js']
    });
  } else if (browser.tabs && browser.tabs.executeScript) {
    console.log('[Firefox Background] Using legacy tabs API'); 
    await browser.tabs.executeScript(tabId, {
      file: 'otp-bridge-firefox.js',
      allFrames: true
    });
  } else {
    throw new Error('No script injection API available');
  }
}

// Check for updates on startup
browser.runtime.onInstalled.addListener(async () => {
  const manifest = browser.runtime.getManifest();
  const currentVersion = manifest.version;

  console.log('Extension installed/updated, checking for updates...');
  await checkForUpdates(currentVersion, browser.storage);
});

// Also check on startup (when browser starts)
browser.runtime.onStartup.addListener(async () => {
  const manifest = browser.runtime.getManifest();
  const currentVersion = manifest.version;

  console.log('Browser started, checking for updates...');
  await checkForUpdates(currentVersion, browser.storage);
});

