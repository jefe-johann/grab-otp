// PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
// Enables refresh token support without client secrets in browser extensions

/**
 * Generate a cryptographically random code verifier for PKCE
 * Must be between 43-128 characters, using unreserved URI characters
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate the code challenge from a code verifier using SHA-256
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encode (RFC 4648) - required for PKCE
 */
function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Exchange authorization code for tokens using PKCE
 * Returns access_token, refresh_token, and expires_in
 * Note: Google requires client_secret even with PKCE for Web Application types
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
  clientSecret?: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
} | null> {
  try {
    const params: Record<string, string> = {
      client_id: clientId,
      code: code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    };

    // Google requires client_secret for Web Application OAuth clients
    if (clientSecret) {
      params.client_secret = clientSecret;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', response.status, errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token exchange error:', error);
    return null;
  }
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string
): Promise<{
  access_token: string;
  expires_in: number;
} | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token refresh failed:', response.status, errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}
