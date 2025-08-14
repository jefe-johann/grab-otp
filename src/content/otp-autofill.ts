// OTP Auto-fill content script
// This script is injected into pages to detect and fill OTP input fields

interface OTPInputCandidate {
  element: HTMLInputElement;
  confidence: number;
  type: 'single' | 'multi';
}

class OTPAutoFiller {
  private static readonly OTP_SELECTORS = [
    // High confidence selectors
    'input[autocomplete="one-time-code"]',
    'input[inputmode="numeric"][maxlength="4"]',
    'input[inputmode="numeric"][maxlength="5"]', 
    'input[inputmode="numeric"][maxlength="6"]',
    'input[inputmode="numeric"][maxlength="7"]',
    'input[inputmode="numeric"][maxlength="8"]',
    
    // Common class-based selectors
    'input.otp-input',
    'input.verification-input',
    'input.otp-field',
    'input.verification-code',
    'input.auth-code',
    '.otp-input input',
    '.verification-input input',
    '.otp-form input',
    '.verification-form input',
    
    // Single digit inputs
    'input[type="text"][maxlength="1"]',
    'input[type="number"][maxlength="1"]',
    
    // Multi-digit fallbacks
    'input[type="text"][maxlength="4"]',
    'input[type="text"][maxlength="5"]',
    'input[type="text"][maxlength="6"]',
    'input[type="text"][maxlength="7"]',
    'input[type="text"][maxlength="8"]',
    'input[type="number"][maxlength="4"]',
    'input[type="number"][maxlength="5"]',
    'input[type="number"][maxlength="6"]',
    'input[type="number"][maxlength="7"]',
    'input[type="number"][maxlength="8"]'
  ];

  private static readonly OTP_KEYWORDS = [
    'otp', 'verification', 'verify', 'code', 'token', 'pin', 'auth', '2fa',
    'two-factor', 'sms', 'security', 'confirm', 'one-time'
  ];

  public static async fillOTP(otpCode: string): Promise<boolean> {
    try {
      console.log('[OTP AutoFill] Attempting to auto-fill OTP:', otpCode);
      
      const candidates = this.findOTPInputs();
      console.log('[OTP AutoFill] Found', candidates.length, 'OTP input candidates');
      
      if (candidates.length === 0) {
        console.log('[OTP AutoFill] No OTP input fields detected');
        return false;
      }
      
      // Sort by confidence and try to fill
      candidates.sort((a, b) => b.confidence - a.confidence);
      
      for (const candidate of candidates) {
        if (await this.tryFillInput(candidate, otpCode)) {
          console.log('[OTP AutoFill] Successfully filled OTP input');
          return true;
        }
      }
      
      console.log('[OTP AutoFill] Could not fill any detected inputs');
      return false;
    } catch (error) {
      console.error('[OTP AutoFill] Error during auto-fill:', error);
      return false;
    }
  }
  
  private static findOTPInputs(): OTPInputCandidate[] {
    const candidates: OTPInputCandidate[] = [];
    
    // Try each selector
    for (const selector of this.OTP_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector) as NodeListOf<HTMLInputElement>;
        
        elements.forEach(element => {
          if (this.isValidOTPInput(element)) {
            const confidence = this.calculateConfidence(element, selector);
            const type = this.determineInputType(element);
            
            candidates.push({
              element,
              confidence,
              type
            });
          }
        });
      } catch (error) {
        console.warn('[OTP AutoFill] Error with selector:', selector, error);
      }
    }
    
    // Remove duplicates (same element found by multiple selectors)
    return this.removeDuplicates(candidates);
  }
  
  private static isValidOTPInput(element: HTMLInputElement): boolean {
    // Skip if element is not visible or disabled
    if (element.disabled || element.readOnly || element.style.display === 'none') {
      return false;
    }
    
    // Skip if element appears to be for other purposes
    const attributes = [
      element.name?.toLowerCase() || '',
      element.id?.toLowerCase() || '',
      element.className?.toLowerCase() || '',
      element.placeholder?.toLowerCase() || '',
      element.getAttribute('data-testid')?.toLowerCase() || ''
    ].join(' ');
    
    // Exclude common non-OTP inputs
    if (attributes.includes('email') || attributes.includes('password') || 
        attributes.includes('username') || attributes.includes('phone')) {
      return false;
    }
    
    return true;
  }
  
  private static calculateConfidence(element: HTMLInputElement, selector: string): number {
    let confidence = 0;
    
    // High confidence for semantic attributes
    if (element.autocomplete === 'one-time-code') confidence += 100;
    if (element.inputMode === 'numeric') confidence += 50;
    
    // Medium confidence for size-based detection
    const maxLength = parseInt(element.maxLength?.toString() || '0');
    if (maxLength >= 4 && maxLength <= 8) confidence += 30;
    if (maxLength === 1) confidence += 20; // Single digit inputs
    
    // Class and name based confidence
    const attributes = [
      element.name?.toLowerCase() || '',
      element.id?.toLowerCase() || '',
      element.className?.toLowerCase() || '',
      element.placeholder?.toLowerCase() || ''
    ].join(' ');
    
    this.OTP_KEYWORDS.forEach(keyword => {
      if (attributes.includes(keyword)) {
        confidence += 10;
      }
    });
    
    // Bonus for being in forms with OTP-related terms
    const form = element.closest('form');
    if (form) {
      const formText = form.textContent?.toLowerCase() || '';
      this.OTP_KEYWORDS.forEach(keyword => {
        if (formText.includes(keyword)) {
          confidence += 5;
        }
      });
    }
    
    return confidence;
  }
  
  private static determineInputType(element: HTMLInputElement): 'single' | 'multi' {
    const maxLength = parseInt(element.maxLength?.toString() || '0');
    return maxLength === 1 ? 'single' : 'multi';
  }
  
  private static removeDuplicates(candidates: OTPInputCandidate[]): OTPInputCandidate[] {
    const seen = new Set<HTMLInputElement>();
    return candidates.filter(candidate => {
      if (seen.has(candidate.element)) {
        return false;
      }
      seen.add(candidate.element);
      return true;
    });
  }
  
  private static async tryFillInput(candidate: OTPInputCandidate, otpCode: string): Promise<boolean> {
    try {
      const { element, type } = candidate;
      
      if (type === 'single') {
        return this.fillSingleDigitInputs(element, otpCode);
      } else {
        return this.fillMultiDigitInput(element, otpCode);
      }
    } catch (error) {
      console.error('[OTP AutoFill] Error filling input:', error);
      return false;
    }
  }
  
  private static fillSingleDigitInputs(firstElement: HTMLInputElement, otpCode: string): boolean {
    // Find all single-digit inputs in the same container
    const container = firstElement.closest('form, div, section') || document;
    const singleInputs = Array.from(container.querySelectorAll('input[maxlength="1"]')) as HTMLInputElement[];
    
    // Filter for valid OTP inputs and sort by position
    const validInputs = singleInputs
      .filter(input => this.isValidOTPInput(input))
      .sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        // Sort by top position first, then left position
        return rectA.top - rectB.top || rectA.left - rectB.left;
      });
    
    if (validInputs.length === 0 || validInputs.length > otpCode.length) {
      return false;
    }
    
    // Fill each input with corresponding digit
    for (let i = 0; i < Math.min(validInputs.length, otpCode.length); i++) {
      const input = validInputs[i];
      const digit = otpCode[i];
      
      // Set value and trigger events
      input.value = digit;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Move focus to next input
      if (i < validInputs.length - 1) {
        validInputs[i + 1].focus();
      }
    }
    
    return true;
  }
  
  private static fillMultiDigitInput(element: HTMLInputElement, otpCode: string): boolean {
    // Set value and trigger events
    element.value = otpCode;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Focus the input
    element.focus();
    
    return true;
  }
}

// Export for use by background scripts
(window as any).OTPAutoFiller = OTPAutoFiller;

// Make fillOTP available globally for programmatic injection
(window as any).fillOTP = (otpCode: string) => OTPAutoFiller.fillOTP(otpCode);