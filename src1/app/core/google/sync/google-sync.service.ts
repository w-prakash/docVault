import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OfflineVaultService } from '../../../services/offline-vault.service';
import { GoogleDriveService } from '../drive/google-drive.service';
import { DocVaultFolderService } from '../drive/docvault-folder.service';
import { DriveOfflineError } from '../drive/google-drive.models';
import { NotificationService } from '../../../services/notification.service';

/**
 * App-wide background sync worker. Unlike the per-page sync logic in
 * documents.page.ts (which reconciles Drive -> local for display), this
 * service owns the outbound queue: pending uploads and deletes that
 * happened while offline. It runs independently of any page being open,
 * triggered by reconnect events.
 *
 * Conflict policy: this app has no metadata-editing feature, so the only
 * real conflict is "deleted locally while offline, but the file still
 * exists on Drive." Local delete always wins - hasPendingDelete() lets
 * the reconciliation pass in documents.page.ts skip resurrecting a file
 * that's queued for deletion until the delete job actually completes.
 */
@Injectable({
  providedIn: 'root'
})
export class GoogleSyncService {

  private draining = false;

  private readonly syncingSubject = new BehaviorSubject<boolean>(false);
  readonly syncing$ = this.syncingSubject.asObservable();

  constructor(
    private readonly offlineVault: OfflineVaultService,
    private readonly driveService: GoogleDriveService,
    private readonly folderService: DocVaultFolderService,
    private readonly notificationService: NotificationService
  ) {}

  /** Call once, app-wide (e.g. from AppComponent.ngOnInit), to auto-drain the queue whenever connectivity returns. */
  startAutoSync(): void {

    window.addEventListener('online', () => {
      console.log('🌐 Back online — draining sync queue');
      this.drainQueue();
    });

    // also try once on startup, in case the app launched already online with jobs left over
    if (navigator.onLine) {
      this.drainQueue();
    }
  }

  async queueDelete(serverId: string): Promise<void> {

    await this.offlineVault.addToSyncQueue({
      type: 'delete',
      server_id: serverId
    });
  }

  /** True if a pending 'delete' job exists for this Drive file id. */
  async hasPendingDelete(serverId: string): Promise<boolean> {

    const jobs = await this.offlineVault.getPendingSyncJobs();

    return jobs.some(
      (j: any) => j.type === 'delete' && j.server_id === serverId
    );
  }

  /** Drains all pending upload/delete jobs against Drive. Safe to call repeatedly — no-ops if offline or already running. */
  async drainQueue(): Promise<void> {

    if (this.draining) {
      console.log('⏳ Sync already in progress');
      return;
    }

    if (!navigator.onLine) {
      console.log('📴 Offline — sync queue skipped');
      return;
    }

    this.draining = true;
    this.syncingSubject.next(true);

    try {

      const jobs = await this.offlineVault.getPendingSyncJobs();

      console.log(`📦 Pending jobs: ${jobs.length}`);

      let completedCount = 0;

      for (const job of jobs) {

        try {

          if (job.type === 'upload') {
            await this.processUploadJob(job);
          } else if (job.type === 'delete') {
            await this.processDeleteJob(job);
          } else {
            console.warn('⚠️ Unknown sync job type', job.type);
          }

          await this.offlineVault.markSyncJobDone(job.id);
          completedCount++;

        } catch (err) {

          if (err instanceof DriveOfflineError) {
            console.log('📴 Went offline mid-sync — stopping, will resume next reconnect');
            break;
          }

          console.error('❌ Sync job failed', job.id, err);
          await this.offlineVault.markSyncJobFailed(job.id);

        }
      }

      if (completedCount > 0) {
        await this.notificationService.syncBackgroundCompleted(completedCount);
      }

      localStorage.setItem('force_sync', 'true');

    } catch (e) {

      console.error('❌ Queue processing failed', e);

    } finally {

      this.draining = false;
      this.syncingSubject.next(false);

    }
  }

  // =====================================
  // PRIVATE
  // =====================================

  private async processUploadJob(job: any): Promise<void> {

    const doc = await this.offlineVault.documents.get(job.document_id);

    if (!doc) {
      console.warn('⚠️ Local doc missing for sync job', job.id);
      return;
    }

    const localFileName =
      doc.local_file_name || doc.file_url.split('/').pop()!;

    const encryptedText =
      await this.offlineVault.readEncryptedFile(localFileName);

    if (!encryptedText) {
      throw new Error(`Encrypted file missing on disk for ${localFileName}`);
    }

    const folderId = await this.folderService.getFolderId();

    const encryptedBlob =
      new Blob([encryptedText], { type: 'application/octet-stream' });

    const driveFile = await this.driveService.uploadMultipart(
      encryptedBlob,
      {
        name: localFileName.replace(/^\d+_/, ''),
        mimeType: 'application/octet-stream',
        parents: [folderId],
        appProperties: {
          member_id: doc.member_id ?? '',
          category_id: doc.category_id ?? '',
          type_id: doc.type_id ?? '',
          original_name: doc.original_name ?? localFileName,
          file_type: doc.file_type ?? 'application/octet-stream'
        }
      }
    );

    await this.offlineVault.documents.update(job.document_id, {
      local_path: doc.local_path,
      local_file_name: doc.local_file_name,
      thumbnail_path: doc.thumbnail_path,
      original_name: doc.original_name,
      server_id: driveFile.id,
      file_url: doc.local_file_name ?? doc.file_url,
      synced: true,
      sync_pending: false,
      sync_failed: false,
      local_only: false
    });

    console.log('✅ Sync queue job done for', doc.original_name);
  }

  private async processDeleteJob(job: any): Promise<void> {

    if (!job.server_id) {
      return; // nothing to delete remotely, drop the job
    }

    try {

      await this.driveService.deleteFile(job.server_id);

    } catch (err: any) {

      // already gone on Drive — treat as success, not a failure to retry forever
      if (err?.status === 404) {
        console.log('ℹ️ File already deleted on Drive', job.server_id);
        return;
      }

      throw err;

    }

    console.log('✅ Deferred delete completed for', job.server_id);
  }

}