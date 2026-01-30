// Account Manager for multi-account Gmail support
// Handles storage, retrieval, and management of multiple Gmail accounts

import { performPKCEAuth, attemptSilentAuth, refreshToken, getUserEmail, OAuthConfig, TokenData } from './oauth';

export interface AccountInfo {
  email: string;
  accessToken: string;
  accessTokenExpires: number;
  refreshToken?: string;
  addedAt: number;
  lastUsedAt: number;
}

export interface AccountStorage {
  accounts: Record<string, AccountInfo>;
  activeAccountEmail: string | null;
}

// Storage keys
const STORAGE_KEY_ACCOUNTS = 'gmail_accounts';
const STORAGE_KEY_ACTIVE = 'active_account_email';

// Legacy storage keys (for migration)
const LEGACY_OAUTH_TOKEN = 'oauth_token';
const LEGACY_OAUTH_EXPIRES = 'oauth_expires';
const LEGACY_REFRESH_TOKEN = 'oauth_refresh_token';

type StorageAPI = {
  local: {
    get: (keys: string | string[]) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (keys: string | string[]) => Promise<void>;
  };
};

type IdentityAPI = {
  getRedirectURL: () => string;
  launchWebAuthFlow: (details: { url: string; interactive: boolean }) => Promise<string>;
};

export class AccountManager {
  private storage: StorageAPI;
  private identity: IdentityAPI;
  private oauthConfig: OAuthConfig;

  constructor(
    storage: StorageAPI,
    identity: IdentityAPI,
    clientId: string,
    clientSecret?: string
  ) {
    this.storage = storage;
    this.identity = identity;
    this.oauthConfig = {
      clientId,
      clientSecret,
      redirectUri: identity.getRedirectURL()
    };
  }

  /**
   * Get all stored accounts
   */
  async getAllAccounts(): Promise<Record<string, AccountInfo>> {
    const result = await this.storage.local.get(STORAGE_KEY_ACCOUNTS);
    return (result[STORAGE_KEY_ACCOUNTS] as Record<string, AccountInfo>) || {};
  }

  /**
   * Get a specific account by email
   */
  async getAccount(email: string): Promise<AccountInfo | null> {
    const accounts = await this.getAllAccounts();
    return accounts[email] || null;
  }

  /**
   * Get the currently active account
   */
  async getActiveAccount(): Promise<AccountInfo | null> {
    const result = await this.storage.local.get([STORAGE_KEY_ACCOUNTS, STORAGE_KEY_ACTIVE]);
    const accounts = (result[STORAGE_KEY_ACCOUNTS] as Record<string, AccountInfo>) || {};
    const activeEmail = result[STORAGE_KEY_ACTIVE] as string | null;

    if (!activeEmail || !accounts[activeEmail]) {
      // If no active account set, return the first account or null
      const emails = Object.keys(accounts);
      if (emails.length > 0) {
        await this.setActiveAccount(emails[0]);
        return accounts[emails[0]];
      }
      return null;
    }

    return accounts[activeEmail];
  }

  /**
   * Get the email of the currently active account
   */
  async getActiveAccountEmail(): Promise<string | null> {
    const result = await this.storage.local.get(STORAGE_KEY_ACTIVE);
    return (result[STORAGE_KEY_ACTIVE] as string) || null;
  }

  /**
   * Set the active account
   */
  async setActiveAccount(email: string): Promise<void> {
    const accounts = await this.getAllAccounts();
    if (!accounts[email]) {
      throw new Error(`Account ${email} not found`);
    }

    // Update last used timestamp
    accounts[email].lastUsedAt = Date.now();

    await this.storage.local.set({
      [STORAGE_KEY_ACCOUNTS]: accounts,
      [STORAGE_KEY_ACTIVE]: email
    });

    console.log('[AccountManager] Active account set to:', email);
  }

  /**
   * Add a new account via OAuth flow
   * Returns the email of the newly added account, or null on failure
   */
  async addAccount(): Promise<string | null> {
    console.log('[AccountManager] Starting OAuth flow to add new account...');

    // Perform PKCE auth with account selection
    const tokenData = await performPKCEAuth(
      this.oauthConfig,
      (details) => this.identity.launchWebAuthFlow(details)
    );

    if (!tokenData) {
      console.log('[AccountManager] OAuth flow failed');
      return null;
    }

    // Get the user's email
    const email = await getUserEmail(tokenData.accessToken);
    if (!email) {
      console.error('[AccountManager] Failed to get user email after auth');
      return null;
    }

    // Store the account
    const accounts = await this.getAllAccounts();
    const now = Date.now();

    accounts[email] = {
      email,
      accessToken: tokenData.accessToken,
      accessTokenExpires: tokenData.accessTokenExpires,
      refreshToken: tokenData.refreshToken,
      addedAt: accounts[email]?.addedAt || now, // Preserve original add date if re-authenticating
      lastUsedAt: now
    };

    await this.storage.local.set({ [STORAGE_KEY_ACCOUNTS]: accounts });

    // If this is the first account, make it active
    const activeEmail = await this.getActiveAccountEmail();
    if (!activeEmail) {
      await this.setActiveAccount(email);
    }

    console.log('[AccountManager] Account added/updated:', email);
    return email;
  }

  /**
   * Remove an account
   */
  async removeAccount(email: string): Promise<void> {
    const accounts = await this.getAllAccounts();

    if (!accounts[email]) {
      return; // Account doesn't exist
    }

    delete accounts[email];
    await this.storage.local.set({ [STORAGE_KEY_ACCOUNTS]: accounts });

    // If we removed the active account, switch to another or clear
    const activeEmail = await this.getActiveAccountEmail();
    if (activeEmail === email) {
      const remainingEmails = Object.keys(accounts);
      if (remainingEmails.length > 0) {
        await this.setActiveAccount(remainingEmails[0]);
      } else {
        await this.storage.local.remove(STORAGE_KEY_ACTIVE);
      }
    }

    console.log('[AccountManager] Account removed:', email);
  }

  /**
   * Get a valid access token for a specific account
   * Automatically refreshes if needed
   */
  async getValidToken(email: string): Promise<string | null> {
    const account = await this.getAccount(email);

    if (!account) {
      console.log('[AccountManager] Account not found:', email);
      return null;
    }

    // Check if current token is still valid (with 1 minute buffer)
    if (account.accessTokenExpires > Date.now() + 60000) {
      return account.accessToken;
    }

    console.log('[AccountManager] Token expired for', email, ', attempting refresh...');

    // Try to refresh the token
    if (account.refreshToken) {
      const newTokenData = await refreshToken(
        account.refreshToken,
        this.oauthConfig.clientId
      );

      if (newTokenData) {
        // Update stored token
        const accounts = await this.getAllAccounts();
        accounts[email] = {
          ...accounts[email],
          accessToken: newTokenData.accessToken,
          accessTokenExpires: newTokenData.accessTokenExpires,
          lastUsedAt: Date.now()
        };
        await this.storage.local.set({ [STORAGE_KEY_ACCOUNTS]: accounts });

        console.log('[AccountManager] Token refreshed for:', email);
        return newTokenData.accessToken;
      }

      console.log('[AccountManager] Token refresh failed for:', email);
    }

    // If refresh failed or no refresh token, try silent auth
    console.log('[AccountManager] Attempting silent auth for:', email);
    const silentTokenData = await attemptSilentAuth(
      this.oauthConfig,
      (details) => this.identity.launchWebAuthFlow(details)
    );

    if (silentTokenData) {
      // Verify this is the same account
      const silentEmail = await getUserEmail(silentTokenData.accessToken);
      if (silentEmail === email) {
        // Update stored token
        const accounts = await this.getAllAccounts();
        accounts[email] = {
          ...accounts[email],
          accessToken: silentTokenData.accessToken,
          accessTokenExpires: silentTokenData.accessTokenExpires,
          lastUsedAt: Date.now()
        };
        await this.storage.local.set({ [STORAGE_KEY_ACCOUNTS]: accounts });

        console.log('[AccountManager] Silent auth succeeded for:', email);
        return silentTokenData.accessToken;
      }
    }

    // Mark account as needing re-authentication
    console.log('[AccountManager] Account needs re-authentication:', email);
    return null;
  }

  /**
   * Get a valid token for the active account
   */
  async getActiveAccountToken(): Promise<{ token: string; email: string } | null> {
    const activeEmail = await this.getActiveAccountEmail();
    if (!activeEmail) {
      return null;
    }

    const token = await this.getValidToken(activeEmail);
    if (!token) {
      return null;
    }

    return { token, email: activeEmail };
  }

  /**
   * Check if any accounts exist
   */
  async hasAccounts(): Promise<boolean> {
    const accounts = await this.getAllAccounts();
    return Object.keys(accounts).length > 0;
  }

  /**
   * Get account count
   */
  async getAccountCount(): Promise<number> {
    const accounts = await this.getAllAccounts();
    return Object.keys(accounts).length;
  }

  /**
   * Migrate from single-account storage to multi-account storage
   * This should be called once during extension upgrade
   */
  async migrateFromSingleAccount(): Promise<boolean> {
    // Check if we already have multi-account storage
    const accounts = await this.getAllAccounts();
    if (Object.keys(accounts).length > 0) {
      console.log('[AccountManager] Already migrated to multi-account storage');
      return false;
    }

    // Check for legacy tokens
    const legacy = await this.storage.local.get([
      LEGACY_OAUTH_TOKEN,
      LEGACY_OAUTH_EXPIRES,
      LEGACY_REFRESH_TOKEN
    ]);

    const legacyToken = legacy[LEGACY_OAUTH_TOKEN] as string | undefined;
    const legacyExpires = legacy[LEGACY_OAUTH_EXPIRES] as number | undefined;
    const legacyRefresh = legacy[LEGACY_REFRESH_TOKEN] as string | undefined;

    if (!legacyToken) {
      console.log('[AccountManager] No legacy tokens to migrate');
      return false;
    }

    console.log('[AccountManager] Found legacy tokens, migrating...');

    // Try to get email from the token
    let email: string | null = null;

    // If token isn't expired, try to get email
    if (legacyExpires && legacyExpires > Date.now()) {
      email = await getUserEmail(legacyToken);
    }

    // If we couldn't get email and have refresh token, try refreshing first
    if (!email && legacyRefresh) {
      const newTokenData = await refreshToken(legacyRefresh, this.oauthConfig.clientId);
      if (newTokenData) {
        email = await getUserEmail(newTokenData.accessToken);
        if (email) {
          // Use the refreshed token
          const now = Date.now();
          const newAccounts: Record<string, AccountInfo> = {
            [email]: {
              email,
              accessToken: newTokenData.accessToken,
              accessTokenExpires: newTokenData.accessTokenExpires,
              refreshToken: legacyRefresh,
              addedAt: now,
              lastUsedAt: now
            }
          };

          await this.storage.local.set({
            [STORAGE_KEY_ACCOUNTS]: newAccounts,
            [STORAGE_KEY_ACTIVE]: email
          });

          // Clean up legacy storage
          await this.storage.local.remove([
            LEGACY_OAUTH_TOKEN,
            LEGACY_OAUTH_EXPIRES,
            LEGACY_REFRESH_TOKEN
          ]);

          console.log('[AccountManager] Migration complete for:', email);
          return true;
        }
      }
    }

    if (email) {
      // Migrate with existing token
      const now = Date.now();
      const newAccounts: Record<string, AccountInfo> = {
        [email]: {
          email,
          accessToken: legacyToken,
          accessTokenExpires: legacyExpires || (now + 3600000), // Default 1 hour if unknown
          refreshToken: legacyRefresh,
          addedAt: now,
          lastUsedAt: now
        }
      };

      await this.storage.local.set({
        [STORAGE_KEY_ACCOUNTS]: newAccounts,
        [STORAGE_KEY_ACTIVE]: email
      });

      // Clean up legacy storage
      await this.storage.local.remove([
        LEGACY_OAUTH_TOKEN,
        LEGACY_OAUTH_EXPIRES,
        LEGACY_REFRESH_TOKEN
      ]);

      console.log('[AccountManager] Migration complete for:', email);
      return true;
    }

    // Couldn't determine email - user will need to re-authenticate
    console.log('[AccountManager] Could not determine email from legacy token, clearing legacy data');
    await this.storage.local.remove([
      LEGACY_OAUTH_TOKEN,
      LEGACY_OAUTH_EXPIRES,
      LEGACY_REFRESH_TOKEN
    ]);

    return false;
  }

  /**
   * Update OAuth config (useful if client ID changes)
   */
  updateConfig(clientId: string, clientSecret?: string): void {
    this.oauthConfig = {
      clientId,
      clientSecret,
      redirectUri: this.identity.getRedirectURL()
    };
  }
}
