// Minimal bridge content script for OTP auto-fill
// Injected immediately on user click to maintain activeTab permission
// Receives OTP data via long-lived port when Gmail fetch completes

console.log('[OTP Bridge] Content script loaded on:', window.location.href);

// Establish long-lived connection to background script
const port = chrome.runtime.connect({ name: 'otpBridge' });

port.onMessage.addListener((message) => {
  console.log('[OTP Bridge] Received message:', message.action);
  
  if (message.action === 'fillOTP' && message.otp) {
    fillOTPCode(message.otp);
  }
});

port.onDisconnect.addListener(() => {
  console.log('[OTP Bridge] Port disconnected');
});

// Simple OTP filling function (can be enhanced later)
async function fillOTPCode(otpCode: string): Promise<void> {
  console.log('[OTP Bridge] Attempting to fill OTP (' + otpCode.length + ' digits)');
  
  // Try common OTP input selectors
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
      if (input.offsetParent !== null && !input.disabled && !input.readOnly) {
        console.log('[OTP Bridge] Filling input (redacted)');
        
        // Fill the input
        input.value = otpCode;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
        
        // Send success message back
        port.postMessage({ action: 'fillResult', success: true });
        return;
      }
    }
  }
  
  console.log('[OTP Bridge] No suitable input found');
  port.postMessage({ action: 'fillResult', success: false, error: 'No input found' });
}

console.log('[OTP Bridge] Ready for OTP data');