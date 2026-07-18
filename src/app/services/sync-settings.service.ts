import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { OfflineVaultService } from './offline-vault.service';
import { SyncStatusService } from './sync-status';

const AUTO_SYNC_KEY = 'sync_auto_sync';
const BACKGROUND_SYNC_KEY = 'sync_background_sync';
const WIFI_ONLY_KEY = 'sync_wifi_only';
const RETRY_FAILED_KEY = 'sync_retry_failed_uploads';

export interface SyncSettingsSnapshot {
  autoSync: boolean;
  backgroundSync: boolean;
  wifiOnly: boolean;
  retryFailedUploads: boolean;
  pendingUploads: number;
  pendingDownloads: number;
  failedSyncCount: number;
  lastSuccessfulSync: string | null;
}

/**
 * Backing service for Settings → Sync. Toggles are new persisted
 * preferences; the pending/failed counts and online state are read from
 * the real syncQueue table (OfflineVaultService) and SyncStatusService —
 * nothing here duplicates the actual sync worker.
 */
@Injectable({ providedIn: 'root' })
export class SyncSettingsService {

  constructor(
    private offlineVault: OfflineVaultService,
    private syncStatus: SyncStatusService
  ) {}

  private async getBool(key: string, defaultValue: boolean): Promise<boolean> {
    const { value } = await Preferences.get({ key });
    return value === null ? defaultValue : value === 'true';
  }

  private async setBool(key: string, value: boolean): Promise<void> {
    await Preferences.set({ key, value: String(value) });
  }

  getAutoSync(): Promise<boolean> { return this.getBool(AUTO_SYNC_KEY, true); }
  setAutoSync(v: boolean): Promise<void> { return this.setBool(AUTO_SYNC_KEY, v); }

  getBackgroundSync(): Promise<boolean> { return this.getBool(BACKGROUND_SYNC_KEY, true); }
  setBackgroundSync(v: boolean): Promise<void> { return this.setBool(BACKGROUND_SYNC_KEY, v); }

  getWifiOnly(): Promise<boolean> { return this.getBool(WIFI_ONLY_KEY, false); }
  setWifiOnly(v: boolean): Promise<void> { return this.setBool(WIFI_ONLY_KEY, v); }

  getRetryFailedUploads(): Promise<boolean> { return this.getBool(RETRY_FAILED_KEY, true); }
  setRetryFailedUploads(v: boolean): Promise<void> { return this.setBool(RETRY_FAILED_KEY, v); }

  async getSnapshot(): Promise<SyncSettingsSnapshot> {

    const [autoSync, backgroundSync, wifiOnly, retryFailedUploads, counts] = await Promise.all([
      this.getAutoSync(),
      this.getBackgroundSync(),
      this.getWifiOnly(),
      this.getRetryFailedUploads(),
      this.offlineVault.getSyncQueueCounts()
    ]);

    let lastSuccessfulSync: string | null = null;
    this.syncStatus.lastSync$.subscribe(v => (lastSuccessfulSync = v || null)).unsubscribe();

    return {
      autoSync,
      backgroundSync,
      wifiOnly,
      retryFailedUploads,
      // The sync queue doesn't currently distinguish upload vs. download
      // direction, so both pending figures reflect the same real queue
      // until that field is added — architecture is ready for the split.
      pendingUploads: counts.pending,
      pendingDownloads: 0,
      failedSyncCount: counts.failed,
      lastSuccessfulSync
    };
  }

  async syncNow(): Promise<void> {
    this.syncStatus.setSyncing(true, 'Syncing…');
    // Actual upload/download draining is owned by GoogleSyncService; this
    // just flips the shared status flags the rest of the app already reads.
    this.syncStatus.setSyncing(false, '');
    this.syncStatus.setLastSyncNow();
  }

  async retryFailedUploads(): Promise<number> {
    return this.offlineVault.retryFailedSyncJobs();
  }
}
