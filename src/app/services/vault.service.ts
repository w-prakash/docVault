import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { ModalController } from '@ionic/angular';
import { VaultUnlockComponent } from '../components/vault-unlock/vault-unlock.component';
import { SupabaseService } from './supabase.service';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Preferences } from '@capacitor/preferences';
@Injectable({ providedIn: 'root' })
export class VaultService {

  private vaultKey: string | null = null;
  private lockTimer: any;
private lockListeners:
  ((locked: boolean) => void)[] = [];
  isUnlocking = false;
  private unlockPromise:
  Promise<string | null> | null = null;
  constructor(private modalCtrl: ModalController, private supabaseService: SupabaseService) {
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
    await this.tryBiometricUnlock();

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

  this.startAutoLock();

  console.log(
    '🔓 Vault unlocked'
  );

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

async validatePassword(
  password: string
): Promise<string | null> {

  try {

    console.log(
      '🔐 VALIDATING PASSWORD'
    );

    let vaultData: any = null;

    // =====================================
    // ONLINE
    // =====================================

    if (navigator.onLine) {

      console.log(
        '🌐 ONLINE VALIDATION'
      );

      const {
        data: userData
      } =
        await this.supabaseService
          .getCurrentUser();

      const userId =
        userData.user?.id;

      if (!userId) {
        return null;
      }

      const {
        data
      } =
        await this.supabaseService
          .getVaultData(
            userId
          );

      if (!data) {
        return null;
      }

      vaultData = data;

      // 💾 save locally

      await this.saveVaultMeta(
        data.salt,
        data.vault_check
      );
    }

    // =====================================
    // OFFLINE
    // =====================================

    else {

      console.log(
        '📴 OFFLINE VALIDATION'
      );

      vaultData =
        await this
          .getLocalVaultMeta();
    }

    // ❌ no vault data

    if (
      !vaultData?.salt ||
      !vaultData?.vault_check
    ) {

      console.error(
        '❌ Vault data missing'
      );

      return null;
    }

    // =====================================
    // DERIVE KEY
    // =====================================

    const key =
      this.deriveKey(
        password,
        vaultData.salt
      );

    console.log(
      '🗝 DERIVED KEY'
    );

    // =====================================
    // VALIDATE
    // =====================================

    const decrypted =
      CryptoJS.AES.decrypt(
        vaultData.vault_check,
        key
      ).toString(
        CryptoJS.enc.Utf8
      );

    console.log(
      '🔓 DECRYPTED',
      decrypted
    );

    // ✅ valid

    if (
      decrypted ===
      'vault-check'
    ) {

      return key;
    }

    return null;

  } catch (e) {

    console.error(
      '❌ VALIDATION ERROR',
      e
    );

    return null;
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
// =====================================

async saveVaultMeta(
  salt: string,
  vaultCheck: string
) {

  console.log(
    '💾 SAVING VAULT META'
  );

  console.log(
    'SALT:',
    salt
  );

  console.log(
    'CHECK:',
    vaultCheck
  );

  await Preferences.set({
    key: 'vault_salt',
    value: salt
  });

  await Preferences.set({
    key: 'vault_check',
    value: vaultCheck
  });

  console.log(
    '✅ VAULT META SAVED'
  );
}

// =====================================
// GET LOCAL VAULT META
// =====================================

async getLocalVaultMeta() {

  const salt =
    await Preferences.get({
      key: 'vault_salt'
    });

  const vaultCheck =
    await Preferences.get({
      key: 'vault_check'
    });

  console.log(
    '📦 LOCAL SALT',
    salt.value
  );

  console.log(
    '📦 LOCAL CHECK',
    vaultCheck.value
  );

  return {
    salt: salt.value,
    vault_check:
      vaultCheck.value
  };
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