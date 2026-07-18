import { Component } from '@angular/core';
import { VaultService } from './services/vault.service';
import { GoogleAuthService } from './core/google/auth/google-auth.service';
import { GoogleSyncService } from './core/google/sync/google-sync.service';
import { UserService } from './services/user.service';
import { SyncStatusService } from './services/sync-status';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {

  showVaultLock = false;
  avatarError = false;
  isOnline = true;

  constructor(
    public vaultService: VaultService,
    public userService: UserService,
    private googleAuthService: GoogleAuthService,
    private googleSyncService: GoogleSyncService,
    private syncStatus: SyncStatusService
  ) {}

  ngOnInit() {

    // Global, app-wide offline indicator — reuses the same isOnline$
    // stream the documents page and sync worker already read from, so
    // there's a single source of truth for connectivity across the app.
    this.syncStatus.isOnline$.subscribe(online => {
      this.isOnline = online;
    });

    // Phase 8: drain any queued uploads/deletes whenever connectivity
    // returns, regardless of which page is currently open.
    this.googleSyncService.startAutoSync();

    this.vaultService.onLockChange((locked) => {

      if (locked) {

        this.showVaultLock = true;

        setTimeout(() => {
          this.showVaultLock = false;
        }, 1600);
      }
    });
  }

  async logout() {

    await this.googleAuthService.signOut();

    window.location.href = '/login';

  }
}