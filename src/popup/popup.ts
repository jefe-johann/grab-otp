declare const browser: typeof import('webextension-polyfill').default;

interface OTPResponse {
  success: boolean;
  otp?: string;
  error?: string;
}

class PopupController {
  private statusElement: HTMLElement;
  private grabButton: HTMLButtonElement;
  private domainElement: HTMLElement;

  constructor() {
    this.statusElement = document.getElementById('status')!;
    this.grabButton = document.getElementById('grabOTP') as HTMLButtonElement;
    this.domainElement = document.getElementById('currentDomain')!;
    
    this.init();
  }

  private async init() {
    await this.displayCurrentDomain();
    this.grabButton.addEventListener('click', () => this.handleGrabOTP());
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

  private async handleGrabOTP() {
    this.setLoading(true);
    this.showStatus('Searching Gmail for OTP...', 'loading');

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        throw new Error('Unable to get current tab URL');
      }

      const domain = new URL(tab.url).hostname;
      
      const response = await browser.runtime.sendMessage({
        action: 'fetchOTP',
        domain: domain
      }) as OTPResponse;

      if (response.success && response.otp) {
        await this.copyToClipboard(response.otp);
        this.showStatus(`OTP copied to clipboard: ${response.otp}`, 'success');
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