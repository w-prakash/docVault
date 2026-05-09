import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { ModalController } from '@ionic/angular';
import { VaultUnlockComponent } from '../components/vault-unlock/vault-unlock.component';
import { SupabaseService } from './supabase.service';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
@Injectable({ providedIn: 'root' })
export class VaultService {

  private vaultKey: string | null = null;
  private lockTimer: any;
private lockListeners:
  ((locked: boolean) => void)[] = [];
  constructor(private modalCtrl: ModalController, private supabaseService: SupabaseService) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
         this.clearKey();
    }
  });
  }

  // 🔐 Get key (main function)
async getVaultKey(): Promise<string | null> {

  // ✅ already unlocked
  if (this.vaultKey) return this.vaultKey;

  // 🔐 STEP 1: Try biometric / device unlock
  const biometricSuccess = await this.tryBiometricUnlock();

  // 👉 If biometric success AND key exists in memory
  if (biometricSuccess && this.vaultKey) {
    return this.vaultKey;
  }

  // 🔑 STEP 2: fallback to password
  const password = await this.openUnlockModal();
  if (!password) return null;

  // 🔥 STEP 3: get user
  const { data: userData } = await this.supabaseService.getCurrentUser();
  const userId = userData.user?.id;

  if (!userId) {
    console.error('User not found');
    return null;
  }

  // 🔥 STEP 4: get salt
  let { data } = await this.supabaseService.getVaultSalt(userId);
  let salt = data?.salt;

  // 🛠 fallback (first time user)
  if (!salt) {
    await this.supabaseService.ensureVault(password);
    const retry = await this.supabaseService.getVaultSalt(userId);
    salt = retry.data?.salt;
  }

  if (!salt) {
    console.error('Salt not found');
    return null;
  }

  // 🔐 STEP 5: derive key
  const key = this.deriveKey(password, salt);

  this.vaultKey = key;
  this.startAutoLock();

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

async validatePassword(
  password: string
): Promise<boolean> {

  try {

    console.log('🔐 VALIDATING PASSWORD');

    const { data: userData } =
      await this.supabaseService
        .getCurrentUser();

    const userId =
      userData.user?.id;

    console.log('👤 USER', userId);

    if (!userId) return false;

    const { data } =
      await this.supabaseService
        .getVaultData(userId);

    console.log('📦 VAULT DATA', data);

    if (!data) return false;

    // 🔐 derive key
    const key = this.deriveKey(
      password,
      data.salt
    );

    console.log('🗝 DERIVED KEY', key);

    // 🔓 decrypt
    const decrypted =
      CryptoJS.AES.decrypt(
        data.vault_check,
        key
      ).toString(CryptoJS.enc.Utf8);

    console.log('🔓 DECRYPTED', decrypted);

    return decrypted ===
      'vault-check';

  } catch (e) {

    console.error(
      '❌ VALIDATION ERROR',
      e
    );

    return false;
  }
}
  // 🔓 modal open
  private async openUnlockModal(): Promise<string | null> {
    const modal = await this.modalCtrl.create({
      component: VaultUnlockComponent
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    return data;
  }

  // 🔒 auto lock after 5 min
  private startAutoLock() {
    clearTimeout(this.lockTimer);

    this.lockTimer = setTimeout(() => {
      this.clearKey();
    }, 5 * 60 * 1000);
  }

  // 🔐 manual lock
clearKey() {

  this.vaultKey = null;

  // 🔒 trigger animation
  this.emitLockState(true);
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
async tryBiometricUnlock(): Promise<boolean> {
  try {
    const availability = await BiometricAuth.checkBiometry();

    // ❌ If device itself is not secure → nothing can be done
    if (!availability.deviceIsSecure) {
      return false;
    }

    // ✅ Always try authentication
    // This will:
    // - Use fingerprint if available
    // - Otherwise show PIN/Pattern
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

}