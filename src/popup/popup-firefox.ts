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
  private updateBanner: HTMLElement;
  private updateMessage: HTMLElement;
  private resultPollingInterval: number | null = null;
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

    // Check for recent OTP results when popup opens
    await this.checkForRecentResults();
  }

  private async displayCurrentDomain() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
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

      const websiteDomain = new URL(tab.url).hostname;

      // Check for domain override
      const override = await this.getOverride(websiteDomain);
      const searchDomain = override || websiteDomain;
      
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
        domain: searchDomain,
        autoFill: this.autoFillCheckbox.checked,
        tabId: tab.id,
        timestamp: Date.now()
      } as OTPRequest);

      // Request sent, keep loading state and start polling for results
      this.startResultPolling();
      
    } catch (error) {
      console.error('Error sending OTP request:', error);
      this.showStatus('Error: ' + (error as Error).message, 'error');
      this.setLoading(false); // Only stop loading on error
      this.stopResultPolling();
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
        
        // Stop loading state and polling when result is shown
        this.setLoading(false);
        this.stopResultPolling();
        
        // Clear the result after showing it (badge clearing disabled)
        await browser.storage.local.remove('latest_otp_result');
        // await this.clearBadge(); // Disabled - no badges set anymore
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

  private startResultPolling() {
    // Poll every 500ms for results while loading
    this.resultPollingInterval = window.setInterval(async () => {
      await this.checkForRecentResults();
    }, 500);
    
    // Stop polling after 30 seconds to avoid infinite polling
    setTimeout(() => {
      this.stopResultPolling();
    }, 30000);
  }

  private stopResultPolling() {
    if (this.resultPollingInterval) {
      clearInterval(this.resultPollingInterval);
      this.resultPollingInterval = null;
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
      const result = await browser.storage.local.get(['domain_overrides']);
      const overrides = result.domain_overrides || {};
      return overrides[websiteDomain] || null;
    } catch (error) {
      console.error('Error getting domain override:', error);
      return null;
    }
  }

  private async saveOverride(websiteDomain: string, emailDomain: string): Promise<void> {
    try {
      const result = await browser.storage.local.get(['domain_overrides']);
      const overrides = result.domain_overrides || {};
      overrides[websiteDomain] = emailDomain;
      await browser.storage.local.set({ domain_overrides: overrides });
    } catch (error) {
      console.error('Error saving domain override:', error);
    }
  }

  private async clearOverride(websiteDomain: string): Promise<void> {
    try {
      const result = await browser.storage.local.get(['domain_overrides']);
      const overrides = result.domain_overrides || {};
      delete overrides[websiteDomain];
      await browser.storage.local.set({ domain_overrides: overrides });
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
      const result = await browser.storage.local.get(['version_check']);
      const versionInfo = result.version_check;

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
  new FirefoxPopupController();
});