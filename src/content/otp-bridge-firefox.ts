// Firefox OTP Bridge Content Script
// Enhanced bridge for Firefox with proper browser API usage and React/Vue compatibility

console.log('[Firefox OTP Bridge] Loading on:', window.location.href);

// Establish connection to background
const port = browser.runtime.connect({ name: 'firefoxOtpBridge' });

port.onMessage.addListener((message: any) => {
  if (message.action === 'fillOTP' && message.otp) {
    fillOTPCode(message.otp);
  }
});

port.onDisconnect.addListener(() => {
  console.log('[Firefox OTP Bridge] Port disconnected');
});

// Enhanced OTP filling function with React/Vue compatibility
async function fillOTPCode(otpCode: string): Promise<void> {
  console.log('[Firefox OTP Bridge] Filling OTP (' + otpCode.length + ' digits)');
  
  // OTP input selectors in priority order
  const selectors = [
    'input[autocomplete="one-time-code"]',
    'input[inputmode="numeric"]', 
    'input[type="text"]',
    'input[type="number"]',
    'input:not([type])'
  ];
  
  for (const selector of selectors) {
    const inputs = document.querySelectorAll(selector) as NodeListOf<HTMLInputElement>;
    
    for (const input of inputs) {
      // Check if input is visible and editable
      if (input.offsetParent !== null && !input.disabled && !input.readOnly) {
        try {
          // Enhanced filling with proper events for modern frameworks
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, otpCode);
          } else {
            // Fallback if descriptor not available
            input.value = otpCode;
          }
          
          // Dispatch events that modern frameworks expect
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('keyup', { bubbles: true }));
          input.focus();
          
          console.log('[Firefox OTP Bridge] OTP filled successfully');
          port.postMessage({ action: 'fillResult', success: true });
          return;
        } catch (error) {
          console.error('[Firefox OTP Bridge] Error filling input:', error);
          continue;
        }
      }
    }
  }
  
  console.log('[Firefox OTP Bridge] No suitable input found');
  port.postMessage({ action: 'fillResult', success: false, error: 'No input found' });
}

console.log('[Firefox OTP Bridge] Ready for OTP data');