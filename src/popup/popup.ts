// Browser polyfill types declared in types.d.ts

interface OTPResponse {
  success: boolean;
  otp?: string;
  error?: string;
}

interface OTPRequest {
  action: string;
  domain: string;
  autoFill?: boolean;
}

class PopupController {
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
  }

  private async displayCurrentDomain() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab?.url) {
        const domain = new URL(tab.url).hostname;
        this.domainElement.textContent = `Current site: ${domain}`;
      } else if (tab?.pendingUrl) {
        const domain = new URL(tab.pendingUrl).hostname;
        this.domainElement.textContent = `Current site: ${domain}`;
      } else {
        this.domainElement.textContent = 'Click "Get OTP" to detect current site';
      }
    } catch (error) {
      console.error('Error getting current domain:', error);
      this.domainElement.textContent = 'Unable to detect current site';
    }
  }

  private async loadAutoFillPreference() {
    try {
      const result = await chrome.storage.local.get(['autoFillEnabled']);
      this.autoFillCheckbox.checked = result.autoFillEnabled ?? true; // Default to true
    } catch (error) {
      console.error('Error loading auto-fill preference:', error);
      this.autoFillCheckbox.checked = true; // Default to true on error
    }
  }

  private async saveAutoFillPreference() {
    try {
      await chrome.storage.local.set({ autoFillEnabled: this.autoFillCheckbox.checked });
    } catch (error) {
      console.error('Error saving auto-fill preference:', error);
    }
  }

  private async handleGrabOTP() {
    this.setLoading(true);
    this.showStatus('Searching Gmail for OTP...', 'loading');

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      
      const tabUrl = tab?.url || tab?.pendingUrl;
      if (!tabUrl) {
        console.error('No URL available in tab object:', Object.keys(tab || {}));
        throw new Error('Unable to get current tab URL - activeTab permission may not be granted');
      }

      const domain = new URL(tabUrl).hostname;
      
      // If auto-fill is enabled, inject bridge immediately (while activeTab is hot)
      if (this.autoFillCheckbox.checked) {
        try {
          console.log('[Popup] Auto-fill enabled, injecting bridge immediately...');
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ['otp-bridge.js']
          });
          
          // Wait a moment for bridge to connect
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log('[Popup] Bridge injected, now fetching OTP...');
        } catch (error) {
          console.error('[Popup] Failed to inject bridge:', error);
          this.showStatus('Auto-fill setup failed, using clipboard only', 'error');
        }
      }

      const response = await chrome.runtime.sendMessage({
        action: 'fetchOTP',
        domain: domain,
        autoFill: this.autoFillCheckbox.checked
      } as OTPRequest) as OTPResponse;

      if (response.success && response.otp) {
        // Always copy to clipboard
        await this.copyToClipboard(response.otp);
        
        // If auto-fill was enabled and bridge was injected, send OTP via background
        if (this.autoFillCheckbox.checked) {
          // Send OTP to background, which will forward to bridge
          chrome.runtime.sendMessage({
            action: 'sendOTPToBridge',
            tabId: tab.id!,
            otp: response.otp
          });
          this.showStatus(`OTP auto-filled & copied: ${response.otp}`, 'success');
        } else {
          this.showStatus(`OTP copied to clipboard: ${response.otp}`, 'success');
        }
      } else {
        this.showStatus(response.error || 'No OTP found in recent emails', 'error');
      }
    } catch (error) {
      console.error('Error fetching OTP:', error);
      this.showStatus('Error: ' + (error as Error).message, 'error');
    } finally {
      this.setLoading(false);
    }
  }

  private async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      throw new Error('Failed to copy to clipboard');
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
  new PopupController();
});