// Chrome background script - uses launchWebAuthFlow for multi-account support
import { AccountManager } from '../shared/account-manager';

declare const __CHROME_CLIENT_ID__: string;
declare const __CHROME_CLIENT_SECRET__: string;

interface FetchOTPMessage {
  action: 'fetchOTP';
  domain: string;
  autoFill?: boolean;
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

// Chrome identity API wrapper to match the interface expected by AccountManager
const chromeIdentity = {
  getRedirectURL: () => chrome.identity.getRedirectURL(),
  launchWebAuthFlow: (details: { url: string; interactive: boolean }): Promise<string> => {
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(details, (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(responseUrl || '');
        }
      });
    });
  }
};

// Chrome storage API wrapper
const chromeStorage = {
  local: {
    get: (keys: string | string[]): Promise<Record<string, unknown>> => {
      return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
      });
    },
    set: (items: Record<string, unknown>): Promise<void> => {
      return new Promise((resolve) => {
        chrome.storage.local.set(items, resolve);
      });
    },
    remove: (keys: string | string[]): Promise<void> => {
      return new Promise((resolve) => {
        chrome.storage.local.remove(keys, resolve);
      });
    }
  }
};

// Initialize AccountManager
const accountManager = new AccountManager(
  chromeStorage,
  chromeIdentity,
  __CHROME_CLIENT_ID__,
  __CHROME_CLIENT_SECRET__
);

class GmailOTPFetcher {
  private readonly OTP_PATTERNS = [
    /\b(\d{6})\b/g,           // 6-digit codes
    /\b(\d{4})\b/g,           // 4-digit codes
    /\b(\d{8})\b/g,           // 8-digit codes
    /verification code[:\s]*(\d+)/gi,
    /your code[:\s]*(\d+)/gi,
    /otp[:\s]*(\d+)/gi,
    /pin[:\s]*(\d+)/gi
  ];

  public async fetchOTPForDomain(domain: string): Promise<OTPResponse> {
    try {
      // Get token from active account
      console.log('[Chrome Background] Getting access token from AccountManager...');
      const tokenInfo = await accountManager.getActiveAccountToken();

      if (!tokenInfo) {
        // Check if we have any accounts
        const hasAccounts = await accountManager.hasAccounts();
        if (!hasAccounts) {
          return { success: false, error: 'No Gmail account configured. Click extension icon to add an account.' };
        }
        return { success: false, error: 'Gmail authentication expired. Please re-authenticate.' };
      }

      const { token, email } = tokenInfo;
      console.log('[Chrome Background] Using account:', email);

      const messages = await this.searchGmailMessages(token, email, domain);
      if (!messages || messages.length === 0) {
        return { success: false, error: `No recent emails found for ${domain}` };
      }

      for (const message of messages.slice(0, 5)) {
        const messageDetail = await this.getMessageDetail(token, email, message.id);
        const otp = this.extractOTP(messageDetail);

        if (otp) {
          return { success: true, otp };
        }
      }

      return { success: false, error: 'No OTP found in recent emails' };
    } catch (error) {
      console.error('[Chrome Background] Error fetching OTP:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  private async searchGmailMessages(token: string, userEmail: string, domain: string): Promise<GmailMessage[]> {
    const query = `from:${domain} OR from:@${domain} newer_than:30m`;
    // Use specific user email instead of 'me' for multi-account support
    const url = `https://www.googleapis.com/gmail/v1/users/${encodeURIComponent(userEmail)}/messages?q=${encodeURIComponent(query)}&maxResults=10`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data: GmailSearchResponse = await response.json();
    return data.messages || [];
  }

  private async getMessageDetail(token: string, userEmail: string, messageId: string): Promise<GmailMessageResponse> {
    // Use specific user email instead of 'me' for multi-account support
    const url = `https://www.googleapis.com/gmail/v1/users/${encodeURIComponent(userEmail)}/messages/${messageId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
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
}

const otpFetcher = new GmailOTPFetcher();

// Store active ports for OTP bridge communication
const activePorts = new Map<number, chrome.runtime.Port>();

// Handle long-lived port connections from bridge content scripts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'otpBridge') {
    console.log('[Background] Bridge connected from tab:', port.sender?.tab?.id);

    if (port.sender?.tab?.id) {
      activePorts.set(port.sender.tab.id, port);

      port.onDisconnect.addListener(() => {
        console.log('[Background] Bridge disconnected from tab:', port.sender?.tab?.id);
        if (port.sender?.tab?.id) {
          activePorts.delete(port.sender.tab.id);
        }
      });
    }
  }
});

// Handle popup messages
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  // Account management messages
  if (message.action === 'getAccounts') {
    (async () => {
      const accounts = await accountManager.getAllAccounts();
      const activeEmail = await accountManager.getActiveAccountEmail();
      sendResponse({ accounts, activeEmail });
    })();
    return true;
  }

  if (message.action === 'addAccount') {
    (async () => {
      const email = await accountManager.addAccount();
      sendResponse({ success: !!email, email });
    })();
    return true;
  }

  if (message.action === 'removeAccount') {
    (async () => {
      await accountManager.removeAccount(message.email);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'setActiveAccount') {
    (async () => {
      await accountManager.setActiveAccount(message.email);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'fetchOTP') {
    // Background only fetches OTP, popup handles bridge injection
    otpFetcher.fetchOTPForDomain(message.domain).then(sendResponse);
    return true; // Required to indicate async response
  }

  if (message.action === 'sendOTPToBridge') {
    // Forward OTP to bridge via port
    console.log('[Background] Forwarding OTP to bridge for tab:', message.tabId);
    const port = activePorts.get(message.tabId);
    if (port && message.otp) {
      console.log('[Background] Sending OTP to bridge via port');
      port.postMessage({ action: 'fillOTP', otp: message.otp });
    } else {
      console.log('[Background] No active port for tab:', message.tabId);
    }
  }
});

// Inline version check (avoid ES module imports for Chrome)
async function checkForUpdates(currentVersion: string): Promise<void> {
  try {
    // Check cache first (24 hour TTL)
    const cached = await chromeStorage.local.get(['version_check']);
    if (cached.version_check &&
        Date.now() - (cached.version_check as any).lastChecked < 24 * 60 * 60 * 1000) {
      return;
    }

    // Fetch latest release from GitHub
    const response = await fetch(
      'https://api.github.com/repos/jefe-johann/grab-otp/releases/latest',
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
    );

    if (!response.ok) {
      console.log('Version check: GitHub API returned', response.status);
      return;
    }

    const release = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, '');

    // Compare versions
    const currentParts = currentVersion.split('.').map((n: string) => parseInt(n, 10));
    const latestParts = latestVersion.split('.').map((n: string) => parseInt(n, 10));
    let updateAvailable = false;

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const curr = currentParts[i] || 0;
      const latest = latestParts[i] || 0;
      if (curr < latest) {
        updateAvailable = true;
        break;
      }
      if (curr > latest) break;
    }

    const versionInfo = {
      current: currentVersion,
      latest: latestVersion,
      updateAvailable,
      lastChecked: Date.now()
    };

    await chromeStorage.local.set({ version_check: versionInfo });
    console.log('Version check:', versionInfo);
  } catch (error) {
    console.log('Version check failed (non-critical):', error);
  }
}

// Initialize on install/startup
async function initialize() {
  console.log('[Chrome Background] Initializing...');

  // Run migration from legacy chrome.identity.getAuthToken to new multi-account storage
  // Note: Legacy Chrome tokens from getAuthToken cannot be migrated as we don't have access
  // to them directly. Users will need to re-authenticate.
  const migrated = await accountManager.migrateFromSingleAccount();
  if (migrated) {
    console.log('[Chrome Background] Migration from single-account completed');
  }

  // Check for updates
  const manifest = chrome.runtime.getManifest();
  await checkForUpdates(manifest.version);
}

// Check for updates on startup
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated');
  await initialize();
});

// Also check on startup (when browser starts)
chrome.runtime.onStartup.addListener(async () => {
  console.log('Browser started');
  await initialize();
});
