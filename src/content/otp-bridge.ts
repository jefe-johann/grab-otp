// Minimal bridge content script for OTP auto-fill
// Injected immediately on user click to maintain activeTab permission
// Receives OTP data via direct message from popup

console.log('[OTP Bridge] Content script loaded on:', window.location.href);

// Listen for direct messages from popup (more reliable than ports)
chrome.runtime.onMessage.addListener((message: { action: string; otp?: string }, _sender, sendResponse) => {
  console.log('[OTP Bridge] Received message:', message.action);

  if (message.action === 'fillOTP' && message.otp) {
    fillOTPCode(message.otp);
    sendResponse({ success: true });
  }
  return true;
});

// Simple OTP filling function
function fillOTPCode(otpCode: string): void {
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
        return;
      }
    }
  }

  console.log('[OTP Bridge] No suitable input found');
}

console.log('[OTP Bridge] Ready for OTP data');
