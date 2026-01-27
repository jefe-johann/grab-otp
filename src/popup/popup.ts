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
  private updateBanner: HTMLElement;
  private updateMessage: HTMLElement;
  private settingsToggle: HTMLButtonElement;
  private overridePanel: HTMLElement;
  private overrideInput: HTMLInputElement;
  private clearOverrideBtn: HTMLButtonElement;
  private overrideStatus: HTMLElement;
  private currentWebsiteDomain: string = '';

  constructor() {
    this.statusElement = document.getElementById('status')!;
    this.grabButton = document.getElementById('grabOTP') as HTMLButtonElement;
    this.domainElement = document.getElementById('currentDomain')!;
    this.autoFillCheckbox = document.getElementById('autoFillEnabled') as HTMLInputElement;
    this.updateBanner = document.getElementById('updateBanner')!;
    this.updateMessage = document.getElementById('updateMessage')!;
    this.settingsToggle = document.getElementById('settingsToggle') as HTMLButtonElement;
    this.overridePanel = document.getElementById('domainOverridePanel')!;
    this.overrideInput = document.getElementById('overrideDomain') as HTMLInputElement;
    this.clearOverrideBtn = document.getElementById('clearOverride') as HTMLButtonElement;
    this.overrideStatus = document.getElementById('overrideStatus')!;

    this.init();
  }

  private async init() {
    // Check for updates
    await this.checkForUpdates();
    await this.displayCurrentDomain();
    await this.loadAutoFillPreference();
    this.grabButton.addEventListener('click', () => this.handleGrabOTP());
    this.autoFillCheckbox.addEventListener('change', () => this.saveAutoFillPreference());

    // Domain override settings
    this.settingsToggle.addEventListener('click', () => this.toggleOverridePanel());
    this.overrideInput.addEventListener('blur', () => this.handleOverrideChange());
    this.overrideInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleOverrideChange();
        this.overrideInput.blur();
      }
    });
    this.clearOverrideBtn.addEventListener('click', () => this.handleClearOverride());
  }

  private async displayCurrentDomain() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabUrl = tab?.url || tab?.pendingUrl;

      if (tabUrl) {
        this.currentWebsiteDomain = new URL(tabUrl).hostname;

        // Check for override
        const override = await this.getOverride(this.currentWebsiteDomain);

        if (override) {
          this.domainElement.textContent = `Searching: ${override}`;
          this.overrideInput.value = override;
          this.overrideStatus.textContent = `Override for ${this.currentWebsiteDomain}`;
        } else {
          this.domainElement.textContent = `Current site: ${this.currentWebsiteDomain}`;
          this.overrideInput.value = '';
          this.overrideStatus.textContent = '';
        }
      } else {
        this.domainElement.textContent = 'Click "Get OTP" to detect current site';
        this.settingsToggle.style.display = 'none';
      }
    } catch (error) {
      console.error('Error getting current domain:', error);
      this.domainElement.textContent = 'Unable to detect current site';
      this.settingsToggle.style.display = 'none';
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

      const websiteDomain = new URL(tabUrl).hostname;

      // Check for domain override
      const override = await this.getOverride(websiteDomain);
      const searchDomain = override || websiteDomain;
      
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
        domain: searchDomain,
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

  // Domain override methods
  private async getOverride(websiteDomain: string): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(['domain_overrides']);
      const overrides = result.domain_overrides || {};
      return overrides[websiteDomain] || null;
    } catch (error) {
      console.error('Error getting domain override:', error);
      return null;
    }
  }

  private async saveOverride(websiteDomain: string, emailDomain: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['domain_overrides']);
      const overrides = result.domain_overrides || {};
      overrides[websiteDomain] = emailDomain;
      await chrome.storage.local.set({ domain_overrides: overrides });
    } catch (error) {
      console.error('Error saving domain override:', error);
    }
  }

  private async clearOverride(websiteDomain: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['domain_overrides']);
      const overrides = result.domain_overrides || {};
      delete overrides[websiteDomain];
      await chrome.storage.local.set({ domain_overrides: overrides });
    } catch (error) {
      console.error('Error clearing domain override:', error);
    }
  }

  private toggleOverridePanel() {
    const isHidden = this.overridePanel.style.display === 'none';
    this.overridePanel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      this.overrideInput.focus();
    }
  }

  private async handleOverrideChange() {
    const value = this.overrideInput.value.trim().toLowerCase();

    if (!this.currentWebsiteDomain) return;

    if (!value) {
      // Empty input - clear override
      await this.clearOverride(this.currentWebsiteDomain);
      this.domainElement.textContent = `Current site: ${this.currentWebsiteDomain}`;
      this.overrideStatus.textContent = '';
      return;
    }

    // Basic validation - should have at least one dot and no spaces
    if (!value.includes('.') || value.includes(' ')) {
      this.overrideStatus.textContent = 'Enter a valid domain (e.g., example.com)';
      this.overrideStatus.style.color = '#c62828';
      return;
    }

    // Don't save if same as detected domain
    if (value === this.currentWebsiteDomain) {
      await this.clearOverride(this.currentWebsiteDomain);
      this.domainElement.textContent = `Current site: ${this.currentWebsiteDomain}`;
      this.overrideStatus.textContent = '';
      return;
    }

    await this.saveOverride(this.currentWebsiteDomain, value);
    this.domainElement.textContent = `Searching: ${value}`;
    this.overrideStatus.textContent = `Override for ${this.currentWebsiteDomain}`;
    this.overrideStatus.style.color = '#2e7d32';
  }

  private async handleClearOverride() {
    if (!this.currentWebsiteDomain) return;

    await this.clearOverride(this.currentWebsiteDomain);
    this.overrideInput.value = '';
    this.domainElement.textContent = `Current site: ${this.currentWebsiteDomain}`;
    this.overrideStatus.textContent = '';
  }

  private async checkForUpdates() {
    try {
      // Inline version check to avoid ES module imports in Chrome
      const cached = await chrome.storage.local.get(['version_check']);
      const versionInfo = cached.version_check;

      if (versionInfo && versionInfo.updateAvailable) {
        this.updateMessage.textContent = `Version ${versionInfo.latest} is available (you have ${versionInfo.current}).`;
        this.updateBanner.style.display = 'block';
      }
    } catch (error) {
      // Silent fail - don't disrupt user experience for version checks
      console.log('Failed to check for updates:', error);
    }
  }

}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});