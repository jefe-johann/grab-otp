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
    this.showStatus('Request sent, processing in background...', 'loading');

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        throw new Error('Unable to get current tab URL');
      }

      const domain = new URL(tab.url).hostname;
      
      // Fire-and-forget: send message but don't wait for response
      browser.runtime.sendMessage({
        action: 'fetchOTP',
        domain: domain,
        autoFill: this.autoFillCheckbox.checked,
        timestamp: Date.now()
      } as OTPRequest);

      // Show user that request was sent
      this.showStatus('Request sent! Watch for badge indicator on extension icon.', 'success');
      
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