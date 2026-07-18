import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { VaultService } from './vault.service';

// =====================================
// STORAGE KEYS
// =====================================

const VAULT_PROTECTION_ENABLED_KEY = 'security_vault_protection_enabled';
const LOCK_ON_BACKGROUND_KEY = 'security_lock_on_background';
const REQUIRE_AUTH_BEFORE_OPEN_KEY = 'security_require_auth_before_open';
const FAILED_UNLOCK_ATTEMPTS_KEY = 'security_failed_unlock_attempts';
const ENCRYPTION_KEY_VERSION_KEY = 'security_encryption_key_version';

export type AutoLockOption = 0 | 1 | 30 | 60 | 300 | 900; // seconds; 0 = Immediately, -1 handled separately for Never

export const AUTO_LOCK_OPTIONS: { label: string; seconds: number }[] = [
  { label: 'Immediately', seconds: 0 },
  { label: '30 Seconds', seconds: 30 },
  { label: '1 Minute', seconds: 60 },
  { label: '5 Minutes', seconds: 300 },
  { label: '15 Minutes', seconds: 900 },
  { label: 'Never', seconds: -1 }
];

export interface SecuritySettingsSnapshot {
  vaultProtectionEnabled: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  autoLockSeconds: number;
  lockOnBackground: boolean;
  requireAuthBeforeOpeningDocuments: boolean;
  lastUnlockTime: string | null;
  vaultLocked: boolean;
  encryptionAlgorithm: string;
  encryptionKeyVersion: number;
  failedUnlockAttempts: number;
}

/**
 * Single source of truth for every setting shown in the Settings → Security
 * section. Thin orchestration layer only — all actual unlock/lock/biometric
 * logic still lives in VaultService; this service just persists the user's
 * preferences and exposes a convenient read model for the Settings page.
 */
@Injectable({ providedIn: 'root' })
export class SecuritySettingsService {

  readonly encryptionAlgorithm = 'AES-256';

  private appStateListenerRegistered = false;

  constructor(private vaultService: VaultService) {
    this.registerBackgroundLockListener();
  }

  // =====================================
  // VAULT PROTECTION
  // =====================================

  async getVaultProtectionEnabled(): Promise<boolean> {
    const { value } = await Preferences.get({ key: VAULT_PROTECTION_ENABLED_KEY });
    return value === null ? true : value === 'true';
  }

  async setVaultProtectionEnabled(enabled: boolean): Promise<void> {
    await Preferences.set({ key: VAULT_PROTECTION_ENABLED_KEY, value: String(enabled) });

    if (!enabled) {
      // Disabling protection is equivalent to leaving the vault unlocked —
      // route guards read this flag to decide whether to enforce unlock.
      this.vaultService.lastUnlockTime = this.vaultService.lastUnlockTime ?? new Date().toISOString();
    }
  }

  // =====================================
  // BIOMETRIC (delegates to VaultService — no duplicate logic)
  // =====================================

  isBiometricAvailable(): Promise<boolean> {
    return this.vaultService.isBiometricAvailable();
  }

  getBiometricEnabled(): Promise<boolean> {
    return this.vaultService.getBiometricEnabled();
  }

  setBiometricEnabled(enabled: boolean): Promise<void> {
    return this.vaultService.setBiometricEnabled(enabled);
  }

  // =====================================
  // AUTO LOCK (delegates persistence to VaultService, seconds-based UI)
  // =====================================

  async getAutoLockSeconds(): Promise<number> {
    const minutes = await this.vaultService.getAutoLockMinutes();
    if (minutes === 0) return -1; // VaultService's "Never" is 0 minutes
    return Math.round(minutes * 60);
  }

  async setAutoLockSeconds(seconds: number): Promise<void> {
    // "Never" (-1) maps back to VaultService's 0-minutes convention.
    const minutes = seconds < 0 ? 0 : seconds / 60;
    await this.vaultService.setAutoLockMinutes(minutes);
  }

  // =====================================
  // LOCK WHEN BACKGROUNDED
  // =====================================

  async getLockOnBackground(): Promise<boolean> {
    const { value } = await Preferences.get({ key: LOCK_ON_BACKGROUND_KEY });
    return value === null ? true : value === 'true';
  }

  async setLockOnBackground(enabled: boolean): Promise<void> {
    await Preferences.set({ key: LOCK_ON_BACKGROUND_KEY, value: String(enabled) });
  }

  private registerBackgroundLockListener(): void {
    if (this.appStateListenerRegistered) return;
    this.appStateListenerRegistered = true;

    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) return;

      const enabled = await this.getLockOnBackground();
      if (enabled) {
        this.vaultService.lockVault();
      }
    }).catch(() => {
      // App plugin listener isn't available on web — VaultService already
      // handles the web case via document.visibilitychange internally.
    });
  }

  // =====================================
  // REQUIRE AUTH BEFORE OPENING DOCUMENTS
  // =====================================

  async getRequireAuthBeforeOpeningDocuments(): Promise<boolean> {
    const { value } = await Preferences.get({ key: REQUIRE_AUTH_BEFORE_OPEN_KEY });
    return value === null ? true : value === 'true';
  }

  async setRequireAuthBeforeOpeningDocuments(enabled: boolean): Promise<void> {
    await Preferences.set({ key: REQUIRE_AUTH_BEFORE_OPEN_KEY, value: String(enabled) });
  }

  // =====================================
  // FAILED UNLOCK ATTEMPTS
  // =====================================

  async getFailedUnlockAttempts(): Promise<number> {
    const { value } = await Preferences.get({ key: FAILED_UNLOCK_ATTEMPTS_KEY });
    return value ? parseInt(value, 10) : 0;
  }

  async recordFailedUnlockAttempt(): Promise<number> {
    const next = (await this.getFailedUnlockAttempts()) + 1;
    await Preferences.set({ key: FAILED_UNLOCK_ATTEMPTS_KEY, value: String(next) });
    return next;
  }

  async resetFailedUnlockAttempts(): Promise<void> {
    await Preferences.set({ key: FAILED_UNLOCK_ATTEMPTS_KEY, value: '0' });
  }

  // =====================================
  // ENCRYPTION KEY VERSION (informational — bumped whenever the vault's
  // key-derivation scheme changes; currently a single fixed version)
  // =====================================

  async getEncryptionKeyVersion(): Promise<number> {
    const { value } = await Preferences.get({ key: ENCRYPTION_KEY_VERSION_KEY });
    return value ? parseInt(value, 10) : 1;
  }

  // =====================================
  // COMBINED READ MODEL — one call for the Settings page to render from
  // =====================================

  async getSnapshot(): Promise<SecuritySettingsSnapshot> {
    const [
      vaultProtectionEnabled,
      biometricAvailable,
      biometricEnabled,
      autoLockSeconds,
      lockOnBackground,
      requireAuthBeforeOpeningDocuments,
      encryptionKeyVersion,
      failedUnlockAttempts
    ] = await Promise.all([
      this.getVaultProtectionEnabled(),
      this.isBiometricAvailable(),
      this.getBiometricEnabled(),
      this.getAutoLockSeconds(),
      this.getLockOnBackground(),
      this.getRequireAuthBeforeOpeningDocuments(),
      this.getEncryptionKeyVersion(),
      this.getFailedUnlockAttempts()
    ]);

    return {
      vaultProtectionEnabled,
      biometricAvailable,
      biometricEnabled,
      autoLockSeconds,
      lockOnBackground,
      requireAuthBeforeOpeningDocuments,
      lastUnlockTime: this.vaultService.lastUnlockTime,
      vaultLocked: !this.vaultService.lastUnlockTime,
      encryptionAlgorithm: this.encryptionAlgorithm,
      encryptionKeyVersion,
      failedUnlockAttempts
    };
  }
}
