import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { ModalController } from '@ionic/angular';
import { VaultUnlockComponent } from '../components/vault-unlock/vault-unlock.component';
// import { SupabaseService } from './supabase.service';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Preferences } from '@capacitor/preferences';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { NotificationService } from './notification.service';
const AUTO_LOCK_MINUTES_KEY = 'vault_auto_lock_minutes';
const BIOMETRIC_ENABLED_KEY = 'vault_biometric_enabled';
const DEFAULT_AUTO_LOCK_MINUTES = 5;

@Injectable({ providedIn: 'root' })
export class VaultService {

  private vaultKey: string | null = null;
  private lockTimer: any;
private lockListeners:
  ((locked: boolean) => void)[] = [];
  isUnlocking = false;
  private unlockPromise:
  Promise<string | null> | null = null;

  /** ISO timestamp of the most recent successful unlock, in-memory only (not persisted — resets on app restart, which is correct: there's nothing to show before the first unlock of a session). */
  lastUnlockTime: string | null = null;

  constructor(
    private modalCtrl: ModalController,
    private notificationService: NotificationService
  ) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
         this.clearKey();
    }
  });
  }

// =====================================
// GET VAULT KEY
// =====================================

// async getVaultKey():
// Promise<string | null> {

//   // ✅ already unlocked
// // this.isUnlocking = true;

//   if (this.vaultKey) {
// this.isUnlocking = false;

//     return this.vaultKey;
//   }

//   // =====================================
//   // BIOMETRIC UNLOCK
//   // =====================================

//   const biometricSuccess =
//     await this.tryBiometricUnlock();

//   if (
//     biometricSuccess &&
//     this.vaultKey
//   ) {
// this.isUnlocking = false;

//     return this.vaultKey;
//   }

//   // =====================================
//   // PASSWORD UNLOCK
//   // =====================================

//   const password =
//     await this.openUnlockModal();
// this.isUnlocking = true;
//   if (!password) {
// this.isUnlocking = false;
//     return null;
//   }

//   // =====================================
//   // VALIDATE PASSWORD
//   // =====================================

//   const valid =
//     await this.validatePassword(
//       password
//     );

//   if (!valid) {

//     console.error(
//       '❌ Invalid password'
//     );
// this.isUnlocking = false;
//     return null;
//   }

//   // =====================================
//   // GET VAULT META
//   // =====================================

//   let vaultData: any = null;

//   // 🌐 ONLINE

//   if (navigator.onLine) {

//     const {
//       data: userData
//     } =
//       await this.supabaseService
//         .getCurrentUser();

//     const userId =
//       userData.user?.id;

//     if (!userId) {
// this.isUnlocking = false;
//       return null;
//     }

//     const {
//       data
//     } =
//       await this.supabaseService
//         .getVaultData(
//           userId
//         );

//     vaultData = data;
//   }

//   // 📴 OFFLINE

//   else {

//     vaultData =
//       await this
//         .getLocalVaultMeta();
//   }

//   if (!vaultData?.salt) {

//     console.error(
//       '❌ Salt missing'
//     );
// this.isUnlocking = false;
//     return null;
//   }

//   // =====================================
//   // DERIVE KEY
//   // =====================================

//   const key =
//     this.deriveKey(
//       password,
//       vaultData.salt
//     );

//   // =====================================
//   // SAVE MEMORY KEY
//   // =====================================

//   this.vaultKey = key;

//   this.startAutoLock();

//   console.log(
//     '🔓 Vault unlocked'
//   );
// this.isUnlocking = false;
//   return key;
// }

// =====================================
// GET VAULT KEY
// =====================================

// =====================================
// GET VAULT KEY
// =====================================

async getVaultKey():
Promise<string | null> {

  // =====================================
  // PREVENT MULTIPLE UNLOCKS
  // =====================================

  if (this.unlockPromise) {

    return this.unlockPromise;
  }

  // =====================================
  // SINGLE UNLOCK FLOW
  // =====================================

  this.unlockPromise =
    this.internalGetVaultKey();

  const result =
    await this.unlockPromise;

  this.unlockPromise =
    null;

  return result;
}

// =====================================
// INTERNAL GET VAULT KEY
// =====================================

private async internalGetVaultKey():
Promise<string | null> {

  // =====================================
  // ALREADY UNLOCKED
  // =====================================

  if (this.vaultKey) {

    this.isUnlocking = false;

    return this.vaultKey;
  }

  // =====================================
  // BIOMETRIC UNLOCK
  // =====================================

  const biometricSuccess =
    (await this.getBiometricEnabled()) &&
    (await this.tryBiometricUnlock());

  if (
    biometricSuccess &&
    this.vaultKey
  ) {

    this.isUnlocking = false;

    return this.vaultKey;
  }

  // =====================================
  // PASSWORD UNLOCK
  // =====================================

  const password =
    await this.openUnlockModal();

  // ❌ cancelled

  if (!password) {

    this.isUnlocking = false;

    return null;
  }

  // =====================================
  // SHOW LOADER
  // =====================================

  this.isUnlocking = true;

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        50
      )
  );

  // =====================================
  // VALIDATE + GET KEY
  // =====================================

  const key =
    await this.validatePassword(
      password
    );

  // ❌ invalid

  if (!key) {

    console.error(
      '❌ Invalid password'
    );

    this.isUnlocking = false;

    return null;
  }

  // =====================================
  // SAVE MEMORY KEY
  // =====================================

  this.vaultKey = key;

  this.lastUnlockTime = new Date().toISOString();

  this.startAutoLock();

  console.log(
    '🔓 Vault unlocked'
  );

  this.emitLockState(false);
  this.notificationService.vaultUnlocked();

  this.isUnlocking = false;

  return key;
}

  // 🔑 PBKDF2 key derivation
private deriveKey(password: string, salt: string): string {

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 100000
  });

  return key.toString();
}

async validatePassword(password: string): Promise<string | null> {

  try {

    console.log('🔐 VALIDATING PASSWORD');

    const vaultData = await this.getLocalVaultMeta();

    if (!vaultData?.salt || !vaultData?.vault_check) {
      console.error('❌ Vault data missing');
      return null;
    }

    const key = this.deriveKey(password, vaultData.salt);

    const decrypted = CryptoJS.AES.decrypt(
      vaultData.vault_check,
      key
    ).toString(CryptoJS.enc.Utf8);

    if (decrypted === 'vault-check') {
      return key;
    }

    return null;

  } catch (e) {
    console.error('❌ VALIDATION ERROR', e);
    return null;
  }
}

async ensureVault(): Promise<void> {

  const existing = await this.getLocalVaultMeta();

  if (existing?.salt && existing?.vault_check) {
    // already provisioned on this device
    return;
  }

  const password = await this.openUnlockModal('create');

  if (!password) {
    throw new Error('Vault setup was cancelled');
  }

  const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
  const key = this.deriveKey(password, salt);
  const vaultCheck = CryptoJS.AES.encrypt('vault-check', key).toString();

  await this.saveVaultMeta(salt, vaultCheck);

  console.log('✅ Vault provisioned locally');
}

  // 🔓 modal open
private async openUnlockModal(mode: 'unlock' | 'create' = 'unlock'): Promise<string | null> {

  const modal = await this.modalCtrl.create({
    component: VaultUnlockComponent,
    componentProps: { mode }
  });

  await modal.present();

  const { data } = await modal.onDidDismiss();
  return data;
}

  // 🔒 auto lock — duration configurable via Settings, defaults to 5 min
  private startAutoLock() {
    clearTimeout(this.lockTimer);

    this.getAutoLockMinutes().then(minutes => {

      // 0 = "Never" — don't schedule a timer at all
      if (minutes <= 0) {
        return;
      }

      this.lockTimer = setTimeout(() => {
        this.clearKey();
      }, minutes * 60 * 1000);

    });
  }

  // =====================================
  // AUTO-LOCK PREFERENCE (Settings)
  // =====================================

  async getAutoLockMinutes(): Promise<number> {

    const { value } = await Preferences.get({ key: AUTO_LOCK_MINUTES_KEY });

    if (value === null || value === undefined) {
      return DEFAULT_AUTO_LOCK_MINUTES;
    }

    const parsed = parseFloat(value);
    return isNaN(parsed) ? DEFAULT_AUTO_LOCK_MINUTES : parsed;
  }

  async setAutoLockMinutes(minutes: number): Promise<void> {

    await Preferences.set({
      key: AUTO_LOCK_MINUTES_KEY,
      value: String(minutes)
    });

    // re-arm immediately with the new duration if currently unlocked
    if (!this.isLocked) {
      this.startAutoLock();
    }
  }

  // =====================================
  // BIOMETRIC PREFERENCE (Settings)
  // =====================================

  async getBiometricEnabled(): Promise<boolean> {

    const { value } = await Preferences.get({ key: BIOMETRIC_ENABLED_KEY });

    // defaults to enabled, matching existing behavior before this toggle existed
    return value === null || value === undefined ? true : value === 'true';
  }

  async setBiometricEnabled(enabled: boolean): Promise<void> {

    await Preferences.set({
      key: BIOMETRIC_ENABLED_KEY,
      value: String(enabled)
    });
  }

  /** Checks device capability without prompting the user — lets Settings decide whether to even show the toggle. */
  async isBiometricAvailable(): Promise<boolean> {

    try {
      const availability = await BiometricAuth.checkBiometry();
      return availability.isAvailable;
    } catch {
      return false;
    }
  }

  // 🔐 manual lock
clearKey() {

  const wasUnlocked = !!this.vaultKey;

  this.vaultKey = null;

  // 🔒 trigger animation
  this.emitLockState(true);

  if (wasUnlocked) {
    this.notificationService.vaultLocked();
  }
}

/** Explicit user-triggered lock (e.g. a "Lock Vault" button in Settings). Same effect as auto-lock, named separately so call sites read clearly. */
lockVault(): void {
  console.log('🔒 Vault locked manually');
  this.clearKey();
}

get isLocked(): boolean {
  return !this.vaultKey;
}

// async tryBiometricUnlock(): Promise<boolean> {
//   try {
//     // 🔍 Check availability
//     const availability = await BiometricAuth.checkBiometry();

//     if (!availability.isAvailable) {
//       return false;
//     }

//     // 🔐 Authenticate
//     await BiometricAuth.authenticate({
//       reason: 'Unlock your vault',
//       cancelTitle: 'Cancel',
//       allowDeviceCredential: true
//     });

//     // ✅ If no error → success
//     return true;

//   } catch (error) {
//     console.warn('Auth failed or cancelled', error);
//     return false;
//   }
// }
// async tryBiometricUnlock(): Promise<boolean> {
//   try {
//     const availability = await BiometricAuth.checkBiometry();

//     // ❌ If device itself is not secure → nothing can be done
//     if (!availability.deviceIsSecure) {
//       return false;
//     }

//     // ✅ Always try authentication
//     // This will:
//     // - Use fingerprint if available
//     // - Otherwise show PIN/Pattern
//     await BiometricAuth.authenticate({
//       reason: 'Unlock your vault',
//       cancelTitle: 'Cancel',
//       allowDeviceCredential: true
//     });

//     return true;

//   } catch (error) {
//     console.warn('Auth failed or cancelled', error);
//     return false;
//   }
// }
async tryBiometricUnlock(): Promise<boolean> {
  try {
    const availability = await BiometricAuth.checkBiometry();

    if (!availability.isAvailable) {
      return false;
    }

    await BiometricAuth.authenticate({
      reason: 'Unlock your vault',
      cancelTitle: 'Cancel',
      allowDeviceCredential: true
    });

    return true;

  } catch (error) {
    console.warn('Auth failed or cancelled', error);
    return false;
  }
}
//onLockChange
onLockChange(
  callback: (locked: boolean) => void
) {

  this.lockListeners.push(callback);
}

private emitLockState(
  state: boolean
) {

  this.lockListeners.forEach(
    cb => cb(state)
  );
}

// =====================================
// SAVE LOCAL VAULT META
// (Keychain on iOS / Keystore-backed EncryptedSharedPreferences on Android —
// not plain @capacitor/preferences, since this is the salt + encrypted
// check value that gates the vault encryption key)
// =====================================

async saveVaultMeta(
  salt: string,
  vaultCheck: string
) {

  await SecureStoragePlugin.set({
    key: 'vault_salt',
    value: salt
  });

  await SecureStoragePlugin.set({
    key: 'vault_check',
    value: vaultCheck
  });

  console.log(
    '✅ VAULT META SAVED (secure storage)'
  );
}

// =====================================
// GET LOCAL VAULT META
// =====================================

async getLocalVaultMeta() {

  const salt = await this.secureGet('vault_salt');
  const vaultCheck = await this.secureGet('vault_check');

  if (salt && vaultCheck) {

    return {
      salt,
      vault_check: vaultCheck
    };
  }

  // ─────────────────────────────
  // ONE-TIME MIGRATION
  // Earlier builds stored this in plain @capacitor/preferences.
  // If secure storage is empty but the old location has data,
  // migrate it rather than locking existing users out of their vault.
  // ─────────────────────────────

  const legacySalt = await Preferences.get({ key: 'vault_salt' });
  const legacyCheck = await Preferences.get({ key: 'vault_check' });

  if (legacySalt.value && legacyCheck.value) {

    console.log('🔁 Migrating vault meta to secure storage');

    await this.saveVaultMeta(legacySalt.value, legacyCheck.value);

    await Preferences.remove({ key: 'vault_salt' });
    await Preferences.remove({ key: 'vault_check' });

    return {
      salt: legacySalt.value,
      vault_check: legacyCheck.value
    };
  }

  return {
    salt: undefined,
    vault_check: undefined
  };
}

/** SecureStoragePlugin throws on a missing key rather than returning null — normalize that. */
private async secureGet(key: string): Promise<string | undefined> {

  try {

    const result = await SecureStoragePlugin.get({ key });
    return result.value;

  } catch {

    return undefined;

  }
}

// =====================================
// CURRENT KEY
// =====================================

get currentKey(): string {

  if (!this.vaultKey) {

    throw new Error(
      'Vault locked'
    );
  }

  return this.vaultKey;
}

}