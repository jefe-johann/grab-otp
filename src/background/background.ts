// Using Chrome APIs directly for better compatibility

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
      return { success: false, error: (error as Error).message };
    }
  }

  private async getAccessToken(): Promise<string | null> {
    try {
      // Use chrome.identity directly for better compatibility
      return new Promise((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.identity) {
          chrome.identity.getAuthToken({
            interactive: true,
            scopes: ['https://www.googleapis.com/auth/gmail.readonly']
          }, (token) => {
            if (chrome.runtime.lastError) {
              console.error('Authentication error:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              resolve(token || null);
            }
          });
        } else {
          reject(new Error('Chrome identity API not available'));
        }
      });
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
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

  // Simplified: just fetch OTP, let popup handle auto-fill injection
}

const otpFetcher = new GmailOTPFetcher();

// Store active ports for OTP bridge communication
const activePorts = new Map<number, chrome.runtime.Port>();

// Removed chrome.action.onClicked handler - auto-fill now happens from popup button

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