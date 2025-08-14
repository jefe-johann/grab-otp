// Firefox popup script - no imports, uses global browser from polyfill
declare const browser: any;

interface OTPResponse {
  success: boolean;
  otp?: string;
  error?: string;
}

interface OTPRequest {
  action: string;
  domain: string;
  autoFill?: boolean;
  tabId?: number;
  timestamp: number;
}

class FirefoxPopupController {
  private statusElement: HTMLElement;
  private grabButton: HTMLButtonElement;
  private domainElement: HTMLElement;
  private autoFillCheckbox: HTMLInputElement;

  constructor() {
    this.statusElement = document.getElementById('status')!;
    this.grabButton = document.getElementById('grabOTP') as HTMLButtonElement;
    this.domainElement = document.getElementById('currentDomain')!;
    this.autoFillCheckbox = document.getElementById('autoFillEnabled') as HTMLInputElement;
    
    this.init();
  }

  private async init() {
    await this.displayCurrentDomain();
    await this.loadAutoFillPreference();
    this.grabButton.addEventListener('click', () => this.handleGrabOTP());
    this.autoFillCheckbox.addEventListener('change', () => this.saveAutoFillPreference());
    
    // Check for recent OTP results when popup opens
    await this.checkForRecentResults();
  }

  private async displayCurrentDomain() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const domain = new URL(tab.url).hostname;
        this.domainElement.textContent = `Current site: ${domain}`;
      }
    } catch (error) {
      console.error('Error getting current domain:', error);
      this.domainElement.textContent = 'Unable to detect current site';
    }
  }

  private async loadAutoFillPreference() {
    try {
      const result = await browser.storage.local.get(['autoFillEnabled']);
      this.autoFillCheckbox.checked = result.autoFillEnabled ?? true; // Default to true
    } catch (error) {
      console.error('Error loading auto-fill preference:', error);
      this.autoFillCheckbox.checked = true; // Default to true on error
    }
  }

  private async saveAutoFillPreference() {
    try {
      await browser.storage.local.set({ autoFillEnabled: this.autoFillCheckbox.checked });
    } catch (error) {
      console.error('Error saving auto-fill preference:', error);
    }
  }

  private async handleGrabOTP() {
    this.setLoading(true);
    this.showStatus('Searching Gmail for OTP...', 'loading');

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !tab.id) {
        throw new Error('Unable to get current tab URL or ID');
      }

      const domain = new URL(tab.url).hostname;
      
      // If auto-fill is enabled, inject bridge immediately via background
      if (this.autoFillCheckbox.checked) {
        try {
          console.log('[Firefox Popup] Auto-fill enabled, requesting bridge injection...');
          const injectionResult = await browser.runtime.sendMessage({
            action: 'injectBridge',
            tabId: tab.id
          });
          
          if (!injectionResult.success) {
            throw new Error(injectionResult.error || 'Bridge injection failed');
          }
          
          // Wait a moment for bridge to connect
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log('[Firefox Popup] Bridge injected, now fetching OTP...');
        } catch (error) {
          console.error('[Firefox Popup] Failed to inject bridge:', error);
          this.showStatus('Auto-fill setup failed, using clipboard only', 'error');
          // Continue with clipboard-only mode
        }
      }
      
      // Send OTP fetch request (fire-and-forget style for Firefox)
      browser.runtime.sendMessage({
        action: 'fetchOTP',
        domain: domain,
        autoFill: this.autoFillCheckbox.checked,
        tabId: tab.id,
        timestamp: Date.now()
      } as OTPRequest);

      // Request sent, keep loading state until result arrives via badge system
      
    } catch (error) {
      console.error('Error sending OTP request:', error);
      this.showStatus('Error: ' + (error as Error).message, 'error');
    } finally {
      this.setLoading(false);
    }
  }

  private async checkForRecentResults() {
    try {
      const result = await browser.storage.local.get('latest_otp_result');
      const latestResult = result['latest_otp_result'];
      
      if (latestResult && Date.now() - latestResult.timestamp < 60000) { // Within 1 minute
        if (latestResult.success && latestResult.otp) {
          this.showStatus(`✅ ${latestResult.message}`, 'success');
          // Auto-select the OTP text for easy copying
          this.statusElement.setAttribute('data-otp', latestResult.otp);
        } else {
          this.showStatus(`❌ ${latestResult.message}`, 'error');
        }
        
        // Clear the result and badge after showing it
        await browser.storage.local.remove('latest_otp_result');
        await this.clearBadge();
      }
    } catch (error) {
      console.log('Could not check recent results:', error);
    }
  }

  private async clearBadge() {
    try {
      await browser.browserAction.setBadgeText({ text: '' });
      await browser.browserAction.setTitle({ title: 'Grab OTP from Gmail' });
    } catch (error) {
      console.log('Could not clear badge:', error);
    }
  }



  private showStatus(message: string, type: 'loading' | 'success' | 'error') {
    this.statusElement.textContent = message;
    this.statusElement.className = `status ${type}`;
    this.statusElement.style.display = 'block';
  }

  private setLoading(isLoading: boolean) {
    this.grabButton.disabled = isLoading;
    if (isLoading) {
      this.grabButton.textContent = 'Searching...';
    } else {
      this.grabButton.textContent = 'Get OTP from Gmail';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new FirefoxPopupController();
});