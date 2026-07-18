import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { VaultService } from '../../services/vault.service';
import { SyncStatusService } from '../../services/sync-status';
import { OfflineVaultService } from '../../services/offline-vault.service';

@Component({
  selector: 'app-manage-devices',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './manage-devices.page.html',
  styleUrls: ['./manage-devices.page.scss']
})
export class ManageDevicesPage implements OnInit, OnDestroy {

  platformLabel = '—';
  browserLabel = '—';
  appVersion = '—';
  biometricAvailable = false;
  biometricEnabled = false;
  autoLockMinutes = 5;
  lastUnlockTime: string | null = null;
  isOnline = true;
  documentCount = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private vaultService: VaultService,
    private syncStatus: SyncStatusService,
    private offlineVault: OfflineVaultService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private location: Location
  ) {}

  ngOnInit() {
    this.detectPlatform();
    this.loadSecurityState();
    this.loadAppInfo();
    this.loadDocumentCount();

    this.syncStatus.isOnline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => (this.isOnline = v));
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack() {
    this.location.back();
  }

  private detectPlatform() {
    const platform = Capacitor.getPlatform();
    this.platformLabel = platform === 'ios' ? 'iOS'
      : platform === 'android' ? 'Android'
      : 'Web browser';

    const ua = navigator.userAgent || '';
    if (/chrome/i.test(ua) && !/edg/i.test(ua)) this.browserLabel = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) this.browserLabel = 'Safari';
    else if (/firefox/i.test(ua)) this.browserLabel = 'Firefox';
    else if (/edg/i.test(ua)) this.browserLabel = 'Edge';
    else this.browserLabel = platform === 'web' ? 'Unknown browser' : this.platformLabel;
  }

  private async loadSecurityState() {
    this.biometricAvailable = await this.vaultService.isBiometricAvailable();
    this.biometricEnabled = await this.vaultService.getBiometricEnabled();
    this.autoLockMinutes = await this.vaultService.getAutoLockMinutes();
    this.lastUnlockTime = this.vaultService.lastUnlockTime;
  }

  private async loadAppInfo() {
    try {
      const info = await App.getInfo();
      this.appVersion = info.version;
    } catch {
      this.appVersion = '0.0.1';
    }
  }

  private async loadDocumentCount() {
    try {
      const docs = await this.offlineVault.getDocuments();
      this.documentCount = docs.length;
    } catch (e) {
      console.error('❌ Failed to load document count', e);
    }
  }

  formatLastUnlock(): string {
    if (!this.lastUnlockTime) {
      return 'Not unlocked this session';
    }
    return new Date(this.lastUnlockTime).toLocaleString([], {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async lockThisDevice() {
    const alert = await this.alertCtrl.create({
      header: 'Lock vault now?',
      message: 'This device will require your vault password (or biometrics) again to view documents.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Lock now',
          handler: async () => {
            this.vaultService.lockVault();
            await this.showToast('Vault locked on this device');
          }
        }
      ]
    });

    await alert.present();
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1800,
      position: 'bottom',
      cssClass: 'vault-toast'
    });
    await toast.present();
  }
}
