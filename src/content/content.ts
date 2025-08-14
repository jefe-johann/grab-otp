// Content script for domain detection and optional auto-fill functionality
import browser from 'webextension-polyfill';

class DomainDetector {
  private currentDomain: string;

  constructor() {
    this.currentDomain = window.location.hostname;
    this.init();
  }

  private init() {
    // Listen for messages from popup or background script
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === 'getCurrentDomain') {
        return Promise.resolve({
          domain: this.currentDomain,
          url: window.location.href
        });
      } else if (message.action === 'copyToClipboard') {
        return this.copyToClipboard(message.text);
      }
    });
  }

  // Handle clipboard copying in content script context
  private async copyToClipboard(text: string): Promise<boolean> {
    try {
      // Try modern clipboard API first (requires secure context)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        console.log('OTP copied to clipboard using modern API');
        return true;
      }
      
      // Fallback to execCommand method
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (success) {
        console.log('OTP copied to clipboard using execCommand');
        return true;
      } else {
        console.log('execCommand copy failed');
        return false;
      }
    } catch (error) {
      console.error('Content script clipboard copy failed:', error);
      return false;
    }
  }

  // Future: Auto-fill OTP into detected input fields
  private findOTPInputs(): HTMLInputElement[] {
    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    
    return inputs.filter(input => {
      const type = input.type?.toLowerCase();
      const name = input.name?.toLowerCase();
      const id = input.id?.toLowerCase();
      const placeholder = input.placeholder?.toLowerCase();
      const autocomplete = input.autocomplete?.toLowerCase();
      
      // Look for OTP-related patterns
      const otpPatterns = [
        'otp', 'code', 'verification', 'verify', 'token', 
        'pin', 'sms', 'auth', '2fa', 'mfa'
      ];
      
      return (
        type === 'text' || 
        type === 'tel' || 
        type === 'number' ||
        otpPatterns.some(pattern => 
          name?.includes(pattern) ||
          id?.includes(pattern) ||
          placeholder?.includes(pattern) ||
          autocomplete?.includes(pattern)
        )
      );
    });
  }

  // Future: Auto-fill the OTP if user opts in
  fillOTP(otp: string): boolean {
    const otpInputs = this.findOTPInputs();
    
    if (otpInputs.length > 0) {
      // Fill the first likely OTP input
      const targetInput = otpInputs[0];
      targetInput.value = otp;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    
    return false;
  }
}

// Initialize the domain detector
new DomainDetector();