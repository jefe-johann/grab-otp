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
      console.log('Attempting to get current tab...');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Tab result:', tab);
      
      if (tab?.url) {
        const domain = new URL(tab.url).hostname;
        this.domainElement.textContent = `Current site: ${domain}`;
        console.log('Domain detected:', domain);
      } else {
        console.log('Tab found but no URL available');
        this.domainElement.textContent = 'No active tab URL available';
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
      console.log('Getting tab for OTP fetch...');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Tab for OTP fetch:', tab);
      
      if (!tab?.url) {
        throw new Error('Unable to get current tab URL');
      }

      const domain = new URL(tab.url).hostname;
      console.log('Using domain for OTP search:', domain);
      
      const response = await chrome.runtime.sendMessage({
        action: 'fetchOTP',
        domain: domain,
        autoFill: this.autoFillCheckbox.checked
      } as OTPRequest) as OTPResponse;

      if (response.success && response.otp) {
        // Always copy to clipboard
        await this.copyToClipboard(response.otp);
        
        // Show appropriate success message
        if (this.autoFillCheckbox.checked) {
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