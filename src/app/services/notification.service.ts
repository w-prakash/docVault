import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OfflineVaultService } from './offline-vault.service';
import {
  AppNotification,
  NewNotification
} from '../models/notification.model';

/**
 * Single entry point for every notification in the app.
 *
 * Upload / Sync / Google Drive / Network / Auth / Security services all
 * call `notify()` (or one of the typed helpers below) instead of touching
 * storage or UI state directly. This service owns:
 *   - persistence (Dexie, via OfflineVaultService)
 *   - the in-memory notification list + unread count (for the bell badge)
 *   - the Notification Center's read/unread + delete/clear operations
 *
 * No feature should manipulate notifications any other way.
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  private readonly notificationsSubject =
    new BehaviorSubject<AppNotification[]>([]);

  readonly notifications$ =
    this.notificationsSubject.asObservable();

  private readonly unreadCountSubject =
    new BehaviorSubject<number>(0);

  readonly unreadCount$ =
    this.unreadCountSubject.asObservable();

  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  constructor(
    private readonly offlineVault: OfflineVaultService
  ) {}

  // =====================================
  // BOOTSTRAP — load persisted notifications once, lazily
  // =====================================

  async ensureLoaded(): Promise<void> {

    if (this.loaded) {
      return;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {

      try {

        const stored = await this.offlineVault.getNotifications();
        this.notificationsSubject.next(stored);
        this.refreshUnreadCount(stored);
        this.loaded = true;

      } catch (e) {

        console.error('❌ Failed to load notifications', e);
      }

    })();

    return this.loadingPromise;
  }

  // =====================================
  // CORE — every notification in the app funnels through here
  // =====================================

  async notify(input: NewNotification): Promise<void> {

    await this.ensureLoaded();

    const notification: AppNotification = {
      ...input,
      timestamp: new Date().toISOString(),
      read: false
    };

    try {

      const id = await this.offlineVault.addNotification(notification);
      notification.id = id;

      const updated = [notification, ...this.notificationsSubject.value];
      this.notificationsSubject.next(updated);
      this.refreshUnreadCount(updated);

    } catch (e) {

      console.error('❌ Failed to save notification', e);
    }
  }

  // =====================================
  // READ STATE
  // =====================================

  async markAsRead(id: number): Promise<void> {

    await this.ensureLoaded();

    const updated = this.notificationsSubject.value.map(n =>
      n.id === id ? { ...n, read: true } : n
    );

    this.notificationsSubject.next(updated);
    this.refreshUnreadCount(updated);

    try {
      await this.offlineVault.updateNotification(id, { read: true });
    } catch (e) {
      console.error('❌ Failed to persist read state', e);
    }
  }

  async markAllAsRead(): Promise<void> {

    await this.ensureLoaded();

    const updated = this.notificationsSubject.value.map(n => ({ ...n, read: true }));
    this.notificationsSubject.next(updated);
    this.refreshUnreadCount(updated);

    try {
      await this.offlineVault.markAllNotificationsRead();
    } catch (e) {
      console.error('❌ Failed to mark all as read', e);
    }
  }

  // =====================================
  // DELETE
  // =====================================

  async deleteNotification(id: number): Promise<void> {

    await this.ensureLoaded();

    const updated = this.notificationsSubject.value.filter(n => n.id !== id);
    this.notificationsSubject.next(updated);
    this.refreshUnreadCount(updated);

    try {
      await this.offlineVault.deleteNotification(id);
    } catch (e) {
      console.error('❌ Failed to delete notification', e);
    }
  }

  async clearAll(): Promise<void> {

    await this.ensureLoaded();

    this.notificationsSubject.next([]);
    this.unreadCountSubject.next(0);

    try {
      await this.offlineVault.clearAllNotifications();
    } catch (e) {
      console.error('❌ Failed to clear notifications', e);
    }
  }

  // =====================================
  // HELPERS
  // =====================================

  private refreshUnreadCount(list: AppNotification[]): void {
    this.unreadCountSubject.next(list.filter(n => !n.read).length);
  }

  get currentUnreadCount(): number {
    return this.unreadCountSubject.value;
  }

  // =====================================
  // TYPED CONVENIENCE HELPERS
  // One per event this app actually fires. Keeps call sites (upload,
  // sync, auth, network, security) short and consistent, and is the
  // single place icon/color/copy live per event type.
  // =====================================

  // ---- Auth ----

  authLoginSuccess(email?: string): Promise<void> {
    return this.notify({
      type: 'auth-login',
      category: 'activity',
      title: 'Signed in',
      message: email ? `Signed in as ${email}` : 'You are now signed in.',
      icon: 'log-in-outline',
      color: 'blue'
    });
  }

  authLogout(): Promise<void> {
    return this.notify({
      type: 'auth-logout',
      category: 'activity',
      title: 'Signed out',
      message: 'You have been signed out of DocVault.',
      icon: 'log-out-outline',
      color: 'blue'
    });
  }

  authSessionExpired(): Promise<void> {
    return this.notify({
      type: 'auth-session-expired',
      category: 'security',
      title: 'Session expired',
      message: 'Your session expired. Please sign in again.',
      icon: 'time-outline',
      color: 'orange'
    });
  }

  // ---- Google Drive ----

  driveUploadStarted(fileName: string): Promise<void> {
    return this.notify({
      type: 'drive-upload-started',
      category: 'sync',
      title: 'Uploading pending',
      message: `${fileName} is being uploaded.`,
      icon: 'cloud-upload-outline',
      color: 'orange'
    });
  }

  driveUploadCompleted(fileName: string): Promise<void> {
    return this.notify({
      type: 'drive-upload-completed',
      category: 'activity',
      title: `${fileName} uploaded`,
      message: `${fileName} uploaded successfully.`,
      icon: 'document-outline',
      color: 'purple'
    });
  }

  driveUploadFailed(fileName: string): Promise<void> {
    return this.notify({
      type: 'drive-upload-failed',
      category: 'sync',
      title: 'Upload failed',
      message: `${fileName} couldn't be uploaded. It will retry automatically.`,
      icon: 'alert-circle-outline',
      color: 'red'
    });
  }

  driveDownloadCompleted(fileName: string): Promise<void> {
    return this.notify({
      type: 'drive-download-completed',
      category: 'activity',
      title: 'Download complete',
      message: `${fileName} is ready.`,
      icon: 'checkmark-circle-outline',
      color: 'green'
    });
  }

  driveDownloadFailed(fileName: string): Promise<void> {
    return this.notify({
      type: 'drive-download-failed',
      category: 'activity',
      title: 'Download failed',
      message: `${fileName} could not be downloaded.`,
      icon: 'alert-circle-outline',
      color: 'red'
    });
  }

  driveDeleteCompleted(fileName: string): Promise<void> {
    return this.notify({
      type: 'drive-delete-completed',
      category: 'activity',
      title: 'Document deleted',
      message: `${fileName} was deleted.`,
      icon: 'trash-outline',
      color: 'red'
    });
  }

  // ---- Sync ----

  syncStarted(): Promise<void> {
    return this.notify({
      type: 'sync-started',
      category: 'sync',
      title: 'Sync started',
      message: 'Syncing your documents…',
      icon: 'sync-outline',
      color: 'blue'
    });
  }

  syncCompleted(count: number): Promise<void> {
    return this.notify({
      type: 'sync-completed',
      category: 'sync',
      title: 'Sync completed',
      message: count > 0
        ? `${count} document${count === 1 ? '' : 's'} synced successfully.`
        : 'All documents are up to date.',
      icon: 'sync-circle-outline',
      color: 'green'
    });
  }

  syncFailed(): Promise<void> {
    return this.notify({
      type: 'sync-failed',
      category: 'sync',
      title: 'Sync failed',
      message: "Some documents couldn't sync. Tap to retry.",
      icon: 'warning-outline',
      color: 'red'
    });
  }

  syncBackgroundCompleted(count: number): Promise<void> {
    return this.notify({
      type: 'sync-background-completed',
      category: 'sync',
      title: 'Background sync completed',
      message: `${count} queued item${count === 1 ? '' : 's'} synced in the background.`,
      icon: 'cloud-done-outline',
      color: 'green'
    });
  }

  // ---- Network ----

  networkOffline(): Promise<void> {
    return this.notify({
      type: 'network-offline',
      category: 'network',
      title: 'You are offline',
      message: 'Changes will sync automatically once you reconnect.',
      icon: 'cloud-offline-outline',
      color: 'orange'
    });
  }

  networkOnline(): Promise<void> {
    return this.notify({
      type: 'network-online',
      category: 'network',
      title: 'Back online',
      message: 'Connection restored. Syncing pending changes…',
      icon: 'cloud-outline',
      color: 'blue'
    });
  }

  // ---- Security ----

  vaultLocked(): Promise<void> {
    return this.notify({
      type: 'vault-locked',
      category: 'security',
      title: 'Vault locked',
      message: 'Your vault was locked.',
      icon: 'lock-closed-outline',
      color: 'green'
    });
  }

  vaultUnlocked(): Promise<void> {
    return this.notify({
      type: 'vault-unlocked',
      category: 'security',
      title: 'Vault unlocked',
      message: 'Your vault was unlocked.',
      icon: 'lock-open-outline',
      color: 'teal'
    });
  }

  vaultPasswordChanged(): Promise<void> {
    return this.notify({
      type: 'vault-password-changed',
      category: 'security',
      title: 'Vault password changed',
      message: 'Your vault password was changed and locally cached files were re-encrypted.',
      icon: 'key-outline',
      color: 'green'
    });
  }

  // ---- Storage ----

  storageAlmostFull(percentUsed: number): Promise<void> {
    return this.notify({
      type: 'storage-almost-full',
      category: 'storage',
      title: 'Storage almost full',
      message: `Local storage is ${percentUsed}% full.`,
      icon: 'server-outline',
      color: 'orange',
      action: { label: 'Manage storage', route: '/settings' }
    });
  }

  storageCacheCleared(): Promise<void> {
    return this.notify({
      type: 'storage-cache-cleared',
      category: 'storage',
      title: 'Cache cleared',
      message: 'Locally cached files were removed to free up space.',
      icon: 'trash-bin-outline',
      color: 'teal'
    });
  }
}
