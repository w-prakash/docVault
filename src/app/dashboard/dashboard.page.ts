import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { VaultService } from '../services/vault.service';
import { UserProfile, UserService } from '../services/user.service';
import { OfflineVaultService } from '../services/offline-vault.service';
import { SyncStatusService } from '../services/sync-status';

interface RecentDoc {
  id: number;
  name: string;
  kind: 'pdf' | 'image' | 'file';
  typeLabel: string;
  createdAt: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule],
})
export class DashboardPage implements OnInit, OnDestroy {
  profile: UserProfile | null = null;
  avatarError = false;

  greeting = 'Welcome back';
  documentCount = 0;
  isOnline = true;
  lastSync = '';
  recentDocuments: RecentDoc[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    public vaultService: VaultService,
    public userService: UserService,
    private offlineVault: OfflineVaultService,
    private syncStatus: SyncStatusService,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.greeting = this.getGreeting();

    this.userService.profile$
      .pipe(takeUntil(this.destroy$))
      .subscribe(profile => (this.profile = profile));

    this.syncStatus.isOnline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => (this.isOnline = v));

    this.syncStatus.lastSync$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => (this.lastSync = v));

    this.loadVaultSummary();
  }

  ionViewWillEnter() {
    this.loadVaultSummary();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  nameLead(displayName: string | undefined | null): string {
    if (!displayName) return '';
    const parts = displayName.trim().split(' ');
    return parts.slice(0, -1).join(' ') || parts[0];
  }

  nameAccent(displayName: string | undefined | null): string {
    if (!displayName) return '';
    const parts = displayName.trim().split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  private getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  private async loadVaultSummary() {
    try {
      const docs = await this.offlineVault.getDocuments();
      this.documentCount = docs.length;

      this.recentDocuments = docs.slice(0, 3).map((doc: any) => {
        const name = doc.original_name || doc.file_url?.split('/').pop() || 'Document';
        const kind = this.getKind(doc.file_type, name);

        return {
          id: doc.id,
          name,
          kind,
          typeLabel: kind === 'pdf' ? 'PDF' : kind === 'image' ? 'Image' : 'Document',
          createdAt: doc.created_at,
        };
      });
    } catch (e) {
      console.error('❌ Failed to load vault summary', e);
    }
  }

  private getKind(fileType: string | undefined, name: string): 'pdf' | 'image' | 'file' {
    const ref = (fileType || name || '').toLowerCase();
    if (ref.includes('pdf')) return 'pdf';
    if (ref.includes('image') || /\.(png|jpe?g|gif|webp|heic)$/.test(ref)) return 'image';
    return 'file';
  }

  async comingSoon(feature: string) {
    const toast = await this.toastCtrl.create({
      message: `${feature} is coming soon`,
      duration: 1600,
      position: 'bottom',
      cssClass: 'vault-toast',
    });
    await toast.present();
  }

  goToUpload() {
    this.router.navigateByUrl('/upload');
  }

  goToDocuments() {
    this.router.navigateByUrl('/documents');
  }

  goToVault() {
    this.router.navigateByUrl('/documents');
  }

  goToHome() {
    this.router.navigateByUrl('/dashboard');
  }

  goToSettings() {
    this.router.navigateByUrl('/settings');
  }
}