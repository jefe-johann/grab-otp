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

  public async fetchOTPWithAutoFill(domain: string, autoFill: boolean): Promise<OTPResponse> {
    // First, fetch the OTP as usual
    const otpResponse = await this.fetchOTPForDomain(domain);
    
    // If successful and auto-fill is enabled, try to inject and fill
    if (otpResponse.success && otpResponse.otp && autoFill) {
      try {
        await this.injectAndFillOTP(otpResponse.otp);
      } catch (error) {
        console.error('Error during auto-fill:', error);
        // Don't fail the entire operation if auto-fill fails
        // The user can still copy from popup
      }
    }
    
    return otpResponse;
  }

  private async injectAndFillOTP(otp: string): Promise<void> {
    try {
      // Get the active tab
      const [tab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });

      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Inject the OTP auto-fill content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['otp-autofill.js']
      });

      // Give the content script a moment to load, then call fillOTP
      setTimeout(async () => {
        try {
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (otpCode: string) => {
              console.log('[Auto-fill] Attempting to fill OTP:', otpCode);
              if (typeof (window as any).fillOTP === 'function') {
                const success = await (window as any).fillOTP(otpCode);
                console.log('[Auto-fill] Fill result:', success);
                return { success, error: null };
              } else {
                console.log('[Auto-fill] fillOTP function not found');
                return { success: false, error: 'fillOTP function not available' };
              }
            },
            args: [otp]
          });
          console.log('Auto-fill script execution result:', result);
        } catch (error) {
          console.error('Error executing auto-fill script:', error);
        }
      }, 100); // Small delay to ensure content script is ready

      console.log('OTP auto-fill injection completed');
    } catch (error) {
      console.error('Failed to inject OTP auto-fill script:', error);
      throw error;
    }
  }
}

const otpFetcher = new GmailOTPFetcher();

chrome.runtime.onMessage.addListener((message: FetchOTPMessage, sender, sendResponse) => {
  if (message.action === 'fetchOTP') {
    otpFetcher.fetchOTPWithAutoFill(message.domain, message.autoFill || false).then(sendResponse);
    return true; // Required to indicate async response
  }
});