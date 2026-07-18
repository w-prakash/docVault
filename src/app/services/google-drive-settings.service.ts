import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { GoogleSessionService } from '../core/google/session/google-session.service';
import { DocVaultFolderService } from '../core/google/drive/docvault-folder.service';
import { GoogleAuthService } from '../core/google/auth/google-auth.service';

const LAST_SYNC_KEY = 'gdrive_last_sync_iso';

export interface GoogleDriveSettingsSnapshot {
  connectedAccountEmail: string | null;
  connectedAccountName: string | null;
  connectionStatus: 'connected' | 'disconnected';
  rootFolderName: string;
  lastSync: string | null;
  /** These two are placeholders until Drive's `about?fields=storageQuota` is wired up server-side — DocVaultFolderService/GoogleDriveService don't expose it yet. Architecture is ready to swap in real values. */
  storageUsedBytes: number | null;
  storageTotalBytes: number | null;
}

/**
 * Backing service for the Settings → Google Drive section. Reuses
 * GoogleSessionService for account identity and DocVaultFolderService for
 * the DocVault root folder — no duplicate auth/session logic. Storage quota
 * is not yet available from GoogleDriveService, so it's surfaced as `null`
 * (rendered as placeholder data in the UI) until that endpoint is added.
 */
@Injectable({ providedIn: 'root' })
export class GoogleDriveSettingsService {

  readonly rootFolderName = 'DocVault';

  constructor(
    private sessionService: GoogleSessionService,
    private docVaultFolderService: DocVaultFolderService,
    private googleAuthService: GoogleAuthService
  ) {}

  async getSnapshot(): Promise<GoogleDriveSettingsSnapshot> {

    const session = this.sessionService.currentSession;
    const { value: lastSync } = await Preferences.get({ key: LAST_SYNC_KEY });

    return {
      connectedAccountEmail: session.user?.email ?? null,
      connectedAccountName: session.user?.displayName ?? null,
      connectionStatus: session.isAuthenticated ? 'connected' : 'disconnected',
      rootFolderName: this.rootFolderName,
      lastSync: lastSync || null,
      // TODO: wire to GoogleDriveService once a `getStorageQuota()` method
      // (GET /drive/v3/about?fields=storageQuota) exists.
      storageUsedBytes: null,
      storageTotalBytes: null
    };
  }

  async markSyncedNow(): Promise<void> {
    await Preferences.set({ key: LAST_SYNC_KEY, value: new Date().toISOString() });
  }

  async syncNow(): Promise<void> {
    // Ensures the DocVault folder exists/resolves — the real, meaningful
    // part of "sync" that's actually implemented today. Full bidirectional
    // sync is handled elsewhere (GoogleSyncService); this just confirms
    // connectivity to Drive and refreshes the folder cache.
    await this.docVaultFolderService.ensureDocVaultFolder();
    await this.markSyncedNow();
  }

  async reconnect(): Promise<void> {
    await this.googleAuthService.signIn();
    await this.docVaultFolderService.clearCache();
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.docVaultFolderService.getFolderId();
      return true;
    } catch {
      return false;
    }
  }

  async getDriveFolderWebUrl(): Promise<string> {
    const folderId = await this.docVaultFolderService.getFolderId();
    return `https://drive.google.com/drive/folders/${folderId}`;
  }
}
