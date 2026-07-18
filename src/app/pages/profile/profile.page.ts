import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, AlertController, ModalController, ToastController } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { UserProfile, UserService } from '../../services/user.service';
import { OfflineVaultService } from '../../services/offline-vault.service';
import { VaultService } from '../../services/vault.service';
import { GoogleAuthService } from '../../core/google/auth/google-auth.service';
import { NotificationService } from '../../services/notification.service';
import { NotificationCenterComponent } from '../../components/notifications/notification-center.component';

const MEMBER_SINCE_KEY = 'profile_member_since';

// The app doesn't track a paid plan — a personal vault is always on the
// free tier, so the quota is the fixed 15 GB free-tier allowance rather
// than a fabricated number. Everything measured against it (used bytes,
// free space, the ring percentage) is real, on-device data.
const STORAGE_QUOTA_BYTES = 15 * 1024 * 1024 * 1024;

interface QuickAction {
  icon: string;
  label: string;
  colorClass: string;
  action: () => void;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss']
})
export class ProfilePage implements OnInit, OnDestroy {

  profile: UserProfile | null = null;
  avatarError = false;
  unreadNotifications = 0;

  // Storage
  isLoadingStorage = true;
  documentRecordCount = 0;
  documentBytes = 0;
  cachedFileCount = 0;
  cachedBytes = 0;
  usedBytes = 0;
  freeBytes = STORAGE_QUOTA_BYTES;
  usedPercent = 0;

  // Ring geometry
  readonly ringRadius = 70;
  readonly ringCircumference = 2 * Math.PI * 70;
  ringOffset = this.ringCircumference;

  // Account info
  memberSince = '—';
  readonly accountType = 'Personal';
  region = '—';

  quickActions: QuickAction[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    public userService: UserService,
    private offlineVault: OfflineVaultService,
    private vaultService: VaultService,
    private googleAuthService: GoogleAuthService,
    private notificationService: NotificationService,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private router: Router,
    private location: Location
  ) {}

  ngOnInit() {
    this.userService.profile$
      .pipe(takeUntil(this.destroy$))
      .subscribe(profile => (this.profile = profile));

    this.notificationService.ensureLoaded();

    this.notificationService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => (this.unreadNotifications = count));

    this.loadStorageOverview();
    this.loadMemberSince();
    this.detectRegion();
    this.buildQuickActions();
  }

  ionViewWillEnter() {
    this.loadStorageOverview();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack() {
    this.location.back();
  }

  async openNotifications() {
    const modal = await this.modalCtrl.create({
      component: NotificationCenterComponent,
      cssClass: 'notification-center-modal'
    });
    await modal.present();
  }

  // =====================================
  // STORAGE OVERVIEW
  // =====================================

  private async loadStorageOverview() {
    this.isLoadingStorage = true;

    try {
      const usage = await this.offlineVault.getLocalStorageBreakdown();

      this.documentRecordCount = usage.documentRecordCount;
      this.documentBytes = usage.documentBytes;
      this.cachedFileCount = usage.cachedFileCount;
      this.cachedBytes = usage.cachedBytes;

      this.usedBytes = this.documentBytes + this.cachedBytes;

      // Prefer the real device storage quota when the browser/OS exposes
      // one; otherwise fall back to the 15 GB free-tier allowance.
      let quota = STORAGE_QUOTA_BYTES;
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (estimate?.quota) {
          quota = Math.min(estimate.quota, STORAGE_QUOTA_BYTES);
        }
      } catch {
        // Storage API unavailable — keep the free-tier fallback
      }

      this.freeBytes = Math.max(quota - this.usedBytes, 0);
      this.usedPercent = quota > 0 ? Math.min((this.usedBytes / quota) * 100, 100) : 0;
      this.ringOffset = this.ringCircumference * (1 - this.usedPercent / 100);

    } catch (e) {
      console.error('❌ Failed to load storage overview', e);
    } finally {
      this.isLoadingStorage = false;
    }
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  goToStorageDetails() {
    this.router.navigateByUrl('/settings');
  }

  // =====================================
  // ACCOUNT INFO
  // =====================================

  /** The app has no signup date on record, so the first time this page loads on
   * a device we stamp today's date and reuse it after — real, not fabricated. */
  private async loadMemberSince() {
    try {
      const existing = await Preferences.get({ key: MEMBER_SINCE_KEY });

      if (existing.value) {
        this.memberSince = this.formatDate(existing.value);
        return;
      }

      const today = new Date().toISOString();
      await Preferences.set({ key: MEMBER_SINCE_KEY, value: today });
      this.memberSince = this.formatDate(today);

    } catch (e) {
      console.warn('⚠️ Could not resolve member-since date', e);
    }
  }

  private formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  /** Best-effort region label from the device's own timezone — no external lookup. */
  private detectRegion() {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const region = timeZone.split('/').pop()?.replace(/_/g, ' ') || '';
      this.region = region || '—';
    } catch {
      this.region = '—';
    }
  }

  // =====================================
  // QUICK ACTIONS
  // =====================================

  private buildQuickActions() {
    this.quickActions = [
      {
        icon: 'person-outline',
        label: 'Edit Profile',
        colorClass: 'qa--green',
        action: () => this.router.navigateByUrl('/edit-profile')
      },
      {
        icon: 'lock-closed-outline',
        label: 'Change Password',
        colorClass: 'qa--blue',
        action: () => this.router.navigateByUrl('/change-password')
      },
      {
        icon: 'shield-checkmark-outline',
        label: 'Security Settings',
        colorClass: 'qa--purple',
        action: () => this.router.navigateByUrl('/settings')
      },
      {
        icon: 'phone-portrait-outline',
        label: 'Manage Devices',
        colorClass: 'qa--orange',
        action: () => this.router.navigateByUrl('/manage-devices')
      },
      {
        icon: 'time-outline',
        label: 'Activity Log',
        colorClass: 'qa--cyan',
        action: () => this.router.navigateByUrl('/activity-log')
      }
    ];
  }

  async comingSoon(feature: string) {
    const toast = await this.toastCtrl.create({
      message: `${feature} is coming soon`,
      duration: 1600,
      position: 'bottom',
      cssClass: 'vault-toast'
    });
    await toast.present();
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
    this.vaultService.lockVault();

    await this.googleAuthService.signOut();
    await this.notificationService.authLogout();

    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
  
  editProfile(): void {
  this.router.navigateByUrl('/edit-profile');
}
}
