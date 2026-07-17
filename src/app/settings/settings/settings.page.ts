import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { UserService } from 'src/app/services/user.service';
import { GoogleAuthService } from 'src/app/core/google/auth/google-auth.service';
import { VaultService } from 'src/app/services/vault.service';
import { OfflineVaultService } from 'src/app/services/offline-vault.service';
import { DocVaultFolderService } from 'src/app/core/google/drive/docvault-folder.service';
import { NotificationService } from 'src/app/services/notification.service';
import { App } from '@capacitor/app';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss']
})
export class SettingsPage implements OnInit {

  documentCount = 0;
  cachedFileCount = 0;
  storageLabel = 'Calculating…';
  isLoadingStorage = true;
  isClearingCache = false;

  // Security section
  biometricAvailable = true;
  biometricEnabled = true;
  autoLockMinutes = 5;
  lastUnlockTime: string | null = null;

  // App Info section
  appVersion = '—';
  appBuild = '—';
  databaseVersion: number | null = null;
  readonly driveApiVersion = 'v3';
  readonly capacitorVersion = '4.x';
  readonly angularVersion = '20.x';
  readonly ionicVersion = '8.x';

  constructor(
    public userService: UserService,
    private googleAuthService: GoogleAuthService,
    public vaultService: VaultService,
    private offlineVault: OfflineVaultService,
    private docVaultFolderService: DocVaultFolderService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.loadStorageUsage();
    this.loadSecuritySettings();
    this.loadAppInfo();
  }

  goToProfile() {
    this.router.navigateByUrl('/profile');
  }

  // =====================================
  // SECURITY
  // =====================================

  private async loadSecuritySettings() {

    this.biometricAvailable = await this.vaultService.isBiometricAvailable();
    this.biometricEnabled = await this.vaultService.getBiometricEnabled();
    this.autoLockMinutes = await this.vaultService.getAutoLockMinutes();
    this.lastUnlockTime = this.vaultService.lastUnlockTime;
  }

  async onBiometricToggle(enabled: boolean) {

    this.biometricEnabled = enabled;
    await this.vaultService.setBiometricEnabled(enabled);

    await this.showToast(
      enabled ? 'Biometric unlock enabled' : 'Biometric unlock disabled'
    );
  }

  async onAutoLockChange(minutes: number) {

    this.autoLockMinutes = minutes;
    await this.vaultService.setAutoLockMinutes(minutes);

    await this.showToast('Auto-lock timer updated');
  }

  formatLastUnlock(): string {

    if (!this.lastUnlockTime) {
      return 'Not unlocked this session';
    }

    return new Date(this.lastUnlockTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // =====================================
  // APP INFO
  // =====================================

  private async loadAppInfo() {

    // Dexie's real, live schema version — not a hardcoded guess
    this.databaseVersion = this.offlineVault.verno;

    try {

      const info = await App.getInfo();
      this.appVersion = info.version;
      this.appBuild = info.build;

    } catch {

      // App.getInfo() isn't implemented on web — fall back to the
      // package.json version baked in at build time (still real, not fake)
      this.appVersion = '0.0.1';
      this.appBuild = '—';

    }
  }

  // =====================================
  // STORAGE USED
  // =====================================

  async loadStorageUsage() {

    this.isLoadingStorage = true;

    try {

      const usage = await this.offlineVault.getLocalStorageUsage();

      this.documentCount = usage.documentCount;
      this.cachedFileCount = usage.cachedFileCount;
      this.storageLabel = this.formatBytes(usage.totalBytes);

      await this.checkStorageQuota();

    } catch (e) {

      console.error('❌ Failed to compute storage usage', e);
      this.storageLabel = 'Unavailable';

    } finally {

      this.isLoadingStorage = false;
    }
  }

  private formatBytes(bytes: number): string {

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Uses the real browser/device Storage API — no synthetic numbers — to warn before the device runs out of room. */
  private async checkStorageQuota() {

    try {

      if (!navigator.storage?.estimate) {
        return;
      }

      const { usage, quota } = await navigator.storage.estimate();

      if (!usage || !quota) {
        return;
      }

      const percentUsed = Math.round((usage / quota) * 100);

      if (percentUsed >= 90) {
        await this.notificationService.storageAlmostFull(percentUsed);
      }

    } catch (e) {
      console.warn('⚠️ Storage quota check unavailable', e);
    }
  }

  // =====================================
  // LOGOUT
  // =====================================

  async logout() {

    const alert = await this.alertCtrl.create({
      header: 'Log out?',
      message: 'You can sign back in with the same Google account any time.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Log out',
          role: 'destructive',
          handler: () => this.performLogout()
        }
      ]
    });

    await alert.present();
  }

  private async performLogout() {

    // Locking the vault on logout means the next sign-in requires the
    // vault password again, even if Google re-authenticates silently.
    this.vaultService.lockVault();

    await this.googleAuthService.signOut();

    await this.notificationService.authLogout();

    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  // =====================================
  // SWITCH ACCOUNT
  // =====================================

  async switchAccount() {

    const alert = await this.alertCtrl.create({
      header: 'Switch Google account?',
      message: 'You\'ll be signed out and taken to the sign-in screen to choose a different account.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Switch account',
          handler: async () => {

            this.vaultService.lockVault();

            await this.googleAuthService.signOut();
            await this.notificationService.authLogout();

            this.router.navigateByUrl('/login', { replaceUrl: true });
          }
        }
      ]
    });

    await alert.present();
  }

  // =====================================
  // CLEAR CACHE
  // =====================================

  async clearCache() {

    const alert = await this.alertCtrl.create({
      header: 'Clear local cache?',
      message: 'This removes files cached on this device to free up space. Your documents stay safely in Google Drive and will re-download the next time you open them.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear cache',
          handler: () => this.performClearCache()
        }
      ]
    });

    await alert.present();
  }

  private async performClearCache() {

    this.isClearingCache = true;

    try {

      await this.offlineVault.clearLocalFileCache();

      await this.showToast('Cache cleared');
      await this.notificationService.storageCacheCleared();

      await this.loadStorageUsage();

    } catch (e) {

      console.error('❌ Clear cache failed', e);
      await this.showToast('Could not clear cache — please try again', 'danger');

    } finally {

      this.isClearingCache = false;
    }
  }

  // =====================================
  // RESET VAULT (destructive — requires typed confirmation)
  // =====================================

  async resetVault() {

    const alert = await this.alertCtrl.create({
      header: '⚠️ Reset Vault',
      message:
        'This erases the vault password on THIS DEVICE and all locally cached data. ' +
        'Files already uploaded to Google Drive are NOT deleted, but you will need to ' +
        'remember your CURRENT vault password to ever decrypt them again — resetting ' +
        'does not recover a forgotten password, it starts over with a new one and treats ' +
        'old encrypted files as permanently unreadable on this device.\n\n' +
        'This cannot be undone. Type RESET below to confirm.',
      inputs: [
        {
          name: 'confirmText',
          type: 'text',
          placeholder: 'Type RESET to confirm'
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reset Vault',
          role: 'destructive',
          handler: (data) => {

            if (data.confirmText !== 'RESET') {
              this.showToast('Type RESET exactly to confirm', 'danger');
              return false; // keep the alert open
            }

            this.performResetVault();
            return true;
          }
        }
      ]
    });

    await alert.present();
  }

  private async performResetVault() {

    try {

      // 1. wipe local documents/queue/reference data
      await this.offlineVault.resetAllLocalData();

      // 2. wipe the vault salt/check from secure storage (forces a brand new vault password on next unlock)
      await SecureStoragePlugin.remove({ key: 'vault_salt' }).catch(() => {});
      await SecureStoragePlugin.remove({ key: 'vault_check' }).catch(() => {});

      // 3. forget the cached DocVault folder id so it's re-resolved cleanly
      await this.docVaultFolderService.clearCache();

      // 4. lock and sign out entirely — safest clean slate
      this.vaultService.lockVault();
      await this.googleAuthService.signOut();

      await this.showToast('Vault reset. Please sign in again.');

      this.router.navigateByUrl('/login', { replaceUrl: true });

    } catch (e) {

      console.error('❌ Vault reset failed', e);
      await this.showToast('Vault reset failed — please try again', 'danger');

    }
  }

  // =====================================
  // HELPERS
  // =====================================

  private async showToast(message: string, color: string = 'success') {

    const toast = await this.toastCtrl.create({
      message,
      duration: 2200,
      color,
      position: 'bottom'
    });

    await toast.present();
  }

}