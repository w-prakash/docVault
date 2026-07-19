import { Injectable } from '@angular/core';
import {
  Filesystem,
  Directory
} from '@capacitor/filesystem';
import Dexie, {
  Table
} from 'dexie';

@Injectable({
  providedIn: 'root'
})
export class OfflineVaultService
extends Dexie {

  // TABLES

  members!: Table<any, string>;

  categories!: Table<any, string>;

  types!: Table<any, string>;

  documents!: Table<any, number>;

  syncQueue!: Table<any, number>;

  notifications!: Table<any, number>;

  constructor() {

    super('docvault');

    // DATABASE SCHEMA

    this.version(5).stores({

      members:
        'id,name',

      categories:
        'id,name',

      types:
        'id,category_id,name',

documents:
'++id,server_id,file_url,original_name,member_id,category_id,type_id,synced,sync_pending,sync_failed,local_only,created_at',
syncQueue:
'++id,type,status,document_id,created_at'
    });

    // v6: add local notifications table (Notification Center — Phase 11)
    this.version(6).stores({

      members:
        'id,name',

      categories:
        'id,name',

      types:
        'id,category_id,name',

documents:
'++id,server_id,file_url,original_name,member_id,category_id,type_id,synced,sync_pending,sync_failed,local_only,created_at',
syncQueue:
'++id,type,status,document_id,created_at',
notifications:
'++id,type,category,timestamp'
    });

    console.log(
      '✅ OfflineVault initialized'
    );
  }

  // =====================================
  // NOTIFICATIONS (Phase 11)
  // =====================================

  async addNotification(notification: any): Promise<number> {
    return await this.notifications.add(notification);
  }

  async getNotifications(): Promise<any[]> {
    return await this.notifications
      .orderBy('timestamp')
      .reverse()
      .toArray();
  }

  async updateNotification(id: number, changes: any): Promise<void> {
    await this.notifications.update(id, changes);
  }

  async deleteNotification(id: number): Promise<void> {
    await this.notifications.delete(id);
  }

  async clearAllNotifications(): Promise<void> {
    await this.notifications.clear();
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.notifications
      .filter((n: any) => !n.read)
      .modify({ read: true });
  }

  async getUnreadNotificationCount(): Promise<number> {
    return await this.notifications
      .filter((n: any) => !n.read)
      .count();
  }

  // =====================================
  // MEMBERS
  // =====================================

  async saveMembers(
    members: any[]
  ) {

    return await this.members
      .bulkPut(members);
  }

  async getMembers() {

    return await this.members
      .toArray();
  }

  // =====================================
  // CATEGORIES
  // =====================================

  async saveCategories(
    categories: any[]
  ) {

    return await this.categories
      .bulkPut(categories);
  }

  async getCategories() {

    return await this.categories
      .toArray();
  }

  // =====================================
  // TYPES
  // =====================================

  async saveTypes(
    types: any[]
  ) {

    return await this.types
      .bulkPut(types);
  }

  async getTypes() {

    return await this.types
      .toArray();
  }
  // =====================================
// DELETE CACHED FILE (+ thumbnail)
// Removes the encrypted vault file and its thumbnail for ONE document.
// Used when a document is deleted so it stops being counted by
// getLocalStorageUsage()/getLocalStorageBreakdown() — without this, the
// storage total stays stale (still shows the old size) forever, since
// those functions read whatever is actually left on disk.
// =====================================

async deleteCachedFile(fileName: string | null | undefined): Promise<void> {

  if (!fileName) {
    return;
  }

  try {

    await Filesystem.deleteFile({
      path: `vault/${fileName}`,
      directory: Directory.Data
    });

    console.log('🗑️ Cached file deleted', fileName);

  } catch {
    // already gone / never cached locally - fine
  }

  try {

    await Filesystem.deleteFile({
      path: `thumbnails/${fileName}.thumb`,
      directory: Directory.Data
    });

    console.log('🗑️ Cached thumbnail deleted', fileName);

  } catch {
    // no thumbnail was ever generated for this file - fine
  }
}

// =====================================
// SAVE ENCRYPTED FILE
// =====================================

async saveEncryptedFile(
  fileName: string,
  encryptedText: string
) {

  try {

    const result =
      await Filesystem.writeFile({

        path:
          `vault/${fileName}`,

        data:
          encryptedText,

        directory:
          Directory.Data,

        recursive: true
      });

    console.log(
      '✅ File cached locally',
      result.uri
    );

    return result.uri;

  } catch (e) {

    console.error(
      '❌ Local save failed',
      e
    );

    return null;
  }
}

// =====================================
// READ ENCRYPTED FILE
// =====================================

async readEncryptedFile(
  fileName: string
) {

  try {

    const result =
      await Filesystem.readFile({

        path:
          `vault/${fileName}`,

        directory:
          Directory.Data
      });

    console.log(
      '✅ Local file loaded'
    );

    return result.data;

  } catch (e) {

    console.warn(
      '⚠️ Local file missing'
    );

    return null;
  }
}

// =====================================
// SAVE DOCUMENTS
// =====================================

async saveDocuments(
  docs: any[]
) {
console.log(
  '💾 Saving docs',
  docs
);
  return await this.documents
    .bulkPut(docs);
}

// =====================================
// GET DOCUMENTS
// =====================================

async getDocuments() {

  return await this.documents
    .orderBy('created_at')
    .reverse()
    .toArray();
}

// =====================================
// SAVE THUMBNAIL
// =====================================

async saveThumbnail(
  fileName: string,
  base64: string
) {

  try {

    await Filesystem.writeFile({

      path:
        `thumbnails/${fileName}`,

      data:
        base64,

      directory:
        Directory.Data,

      recursive: true
    });

    console.log(
      '🖼 Thumbnail cached'
    );

    return `thumbnails/${fileName}`;

  } catch (e) {

    console.error(
      '❌ Thumbnail save failed',
      e
    );

    return '';
  }
}

// =====================================
// READ THUMBNAIL
// =====================================

async readThumbnail(
  fileName: string
) {

  try {

    const result =
      await Filesystem.readFile({

        path:
          `thumbnails/${fileName}`,

        directory:
          Directory.Data
      });

    return result.data;

  } catch {

    return null;
  }
}
// =====================================
// FILE EXISTS
// =====================================

async fileExists(
  fileName: string
) {

  try {

    await Filesystem.stat({

      path:
        `vault/${fileName}`,

      directory:
        Directory.Data
    });

    return true;

  } catch {

    return false;
  }
}

// =====================================
// SAVE LOCAL DOCUMENT
// =====================================

async saveLocalDocument(
  doc: any
) {

  // ✅ preserve existing timestamp

  if (!doc.created_at) {

    doc.created_at =
      new Date()
        .toISOString();
  }

  return await this.documents
    .put(doc);
}
// =====================================
// ADD SYNC JOB
// =====================================

async addToSyncQueue(
  job: any
) {

  return await this.syncQueue
    .add({

      ...job,

      status: 'pending',

      created_at:
        new Date().toISOString()
    });
}
// =====================================
// GET PENDING SYNC JOBS
// =====================================

async getPendingSyncJobs(): Promise<any[]> {

  return await this.syncQueue
    .where('status')
    .equals('pending')
    .toArray();
}

// =====================================
// MARK SYNC JOB DONE
// =====================================

async markSyncJobDone(
  id: number
): Promise<void> {

  await this.syncQueue
    .delete(id);
}

// =====================================
// MARK SYNC JOB FAILED
// =====================================

async markSyncJobFailed(
  id: number
): Promise<void> {

  const job =
    await this.syncQueue
      .get(id);

  if (!job) {
    return;
  }

  const retryCount =
    (job.retry_count ?? 0) + 1;

  await this.syncQueue
    .update(id, {

      status:
        retryCount >= 5
          ? 'failed'
          : 'pending',

      retry_count:
        retryCount
    });
}

// =====================================
// RECONCILE CACHE (self-heal orphaned files)
// Deletes any vault/thumbnail file on disk that isn't referenced by a
// current document row. This is what actually cleans up files left
// behind by OLDER installs (from before per-document delete removed its
// own cached file) — deleting a document going forward no longer leaves
// an orphan, but this sweep is what fixes ones that already exist.
// Runs automatically before every storage read, so the numbers are
// always self-correcting without the user having to hit "Clear Cache"
// (which would also wipe cache for documents that are still valid).
// =====================================

private async reconcileLocalFileCache(): Promise<void> {

  try {

    const docs = await this.documents.toArray();

    const validVaultNames = new Set<string>();
    const validThumbNames = new Set<string>();

    for (const doc of docs) {

      const fileName =
        doc.local_file_name ||
        doc.file_url?.split('/')?.pop();

      if (fileName) {
        validVaultNames.add(fileName);
        validThumbNames.add(`${fileName}.thumb`);
      }
    }

    await this.removeOrphanedFiles('vault', validVaultNames);
    await this.removeOrphanedFiles('thumbnails', validThumbNames);

  } catch (e) {
    console.warn('⚠️ Cache reconciliation failed', e);
  }
}

private async removeOrphanedFiles(dir: string, validNames: Set<string>): Promise<void> {

  try {

    const result =
      await Filesystem.readdir({
        path: dir,
        directory: Directory.Data
      });

    for (const file of result.files) {

      if (file.type === 'file' && !validNames.has(file.name)) {

        try {

          await Filesystem.deleteFile({
            path: `${dir}/${file.name}`,
            directory: Directory.Data
          });

          console.log('🧹 Removed orphaned cache file', `${dir}/${file.name}`);

        } catch {
          // best-effort — if it can't be removed now, next sweep will retry
        }
      }
    }

  } catch {
    // directory doesn't exist - nothing to reconcile
  }
}

// =====================================
// STORAGE USED (Phase 10)
// =====================================

async getLocalStorageUsage(): Promise<{
  documentCount: number;
  cachedFileCount: number;
  totalBytes: number;
}> {

  await this.reconcileLocalFileCache();

  const documentCount =
    await this.documents.count();

  let cachedFileCount = 0;
  let totalBytes = 0;

  for (const dir of ['vault', 'thumbnails']) {

    try {

      const result =
        await Filesystem.readdir({
          path: dir,
          directory: Directory.Data
        });

      for (const file of result.files) {

        if (file.type === 'file') {
          cachedFileCount++;
          totalBytes += file.size ?? 0;
        }
      }

    } catch {
      // directory doesn't exist yet - nothing cached, that's fine
    }
  }

  return {
    documentCount,
    cachedFileCount,
    totalBytes
  };
}

// =====================================
// STORAGE BREAKDOWN (Profile page)
// Same directories as getLocalStorageUsage(), but split by directory
// instead of combined, so the UI can show "Documents" vs "Cached Files"
// as separate rows with their own real byte counts.
// =====================================

async getLocalStorageBreakdown(): Promise<{
  documentRecordCount: number;
  documentBytes: number;
  cachedFileCount: number;
  cachedBytes: number;
}> {

  await this.reconcileLocalFileCache();

  const documentRecordCount =
    await this.documents.count();

  let documentBytes = 0;
  let cachedFileCount = 0;
  let cachedBytes = 0;

  try {

    const vaultDir =
      await Filesystem.readdir({
        path: 'vault',
        directory: Directory.Data
      });

    for (const file of vaultDir.files) {
      if (file.type === 'file') {
        documentBytes += file.size ?? 0;
      }
    }

  } catch {
    // 'vault' directory doesn't exist yet - nothing cached, that's fine
  }

  try {

    const thumbsDir =
      await Filesystem.readdir({
        path: 'thumbnails',
        directory: Directory.Data
      });

    for (const file of thumbsDir.files) {
      if (file.type === 'file') {
        cachedFileCount++;
        cachedBytes += file.size ?? 0;
      }
    }

  } catch {
    // 'thumbnails' directory doesn't exist yet - nothing cached, that's fine
  }

  return {
    documentRecordCount,
    documentBytes,
    cachedFileCount,
    cachedBytes
  };
}

// =====================================
// CLEAR CACHE (Phase 10)
// Removes locally cached encrypted files + thumbnails to free device
// storage. Document metadata is kept and marked as not-locally-cached,
// so the next view/download re-fetches from Drive - nothing on Drive
// is touched or lost.
// =====================================

async clearLocalFileCache(): Promise<void> {

  for (const dir of ['vault', 'thumbnails']) {

    try {

      const result =
        await Filesystem.readdir({
          path: dir,
          directory: Directory.Data
        });

      for (const file of result.files) {

        if (file.type === 'file') {

          await Filesystem.deleteFile({
            path: `${dir}/${file.name}`,
            directory: Directory.Data
          });
        }
      }

    } catch {
      // nothing cached in this dir - fine
    }
  }

  const allDocs = await this.documents.toArray();

  for (const doc of allDocs) {

    if (doc.local_only) {
      // never uploaded - clearing cache would destroy the only copy, skip it
      continue;
    }

    await this.documents.update(doc.id, {
      local_path: null,
      thumbnail_path: null
    });
  }

  console.log('Local file cache cleared');
}

// =====================================
// SYNC QUEUE COUNTS (Settings → Sync section)
// Reuses the same syncQueue table that addToSyncQueue/markSyncJobDone/
// markSyncJobFailed already manage — no new state, just read-side counts.
// =====================================

async getSyncQueueCounts(): Promise<{ pending: number; failed: number }> {

  const [pending, failed] = await Promise.all([
    this.syncQueue.where('status').equals('pending').count(),
    this.syncQueue.where('status').equals('failed').count()
  ]);

  return { pending, failed };
}

// =====================================
// RETRY FAILED SYNC JOBS
// Flips 'failed' jobs back to 'pending' and resets their retry_count so
// the existing sync worker (whatever drains 'pending' jobs) picks them
// back up on its next pass. Does not duplicate the actual upload/download
// logic - just re-queues.
// =====================================

async retryFailedSyncJobs(): Promise<number> {

  const failedJobs =
    await this.syncQueue.where('status').equals('failed').toArray();

  for (const job of failedJobs) {
    await this.syncQueue.update(job.id, { status: 'pending', retry_count: 0 });
  }

  return failedJobs.length;
}

// =====================================
// DIRECTORY BYTE SIZE (shared helper — used by the detailed storage
// breakdown below; does not change existing clearLocalFileCache /
// resetAllLocalData behaviour)
// =====================================

private async directoryStats(dir: string): Promise<{ count: number; bytes: number; largest: number }> {

  let count = 0;
  let bytes = 0;
  let largest = 0;

  try {

    const result = await Filesystem.readdir({ path: dir, directory: Directory.Data });

    for (const file of result.files) {

      if (file.type === 'file') {
        count++;
        bytes += file.size ?? 0;
        largest = Math.max(largest, file.size ?? 0);
      }
    }

  } catch {
    // directory doesn't exist yet - nothing there
  }

  return { count, bytes, largest };
}

// =====================================
// DETAILED STORAGE BREAKDOWN (Settings → Storage section)
// =====================================

async getDetailedStorageBreakdown(): Promise<{
  vaultBytes: number;
  thumbnailBytes: number;
  fileCount: number;
  largestFileBytes: number;
  averageFileBytes: number;
  databaseSizeEstimateBytes: number;
}> {

  const [vaultStats, thumbStats] = await Promise.all([
    this.directoryStats('vault'),
    this.directoryStats('thumbnails')
  ]);

  const fileCount = vaultStats.count + thumbStats.count;
  const totalBytes = vaultStats.bytes + thumbStats.bytes;
  const largestFileBytes = Math.max(vaultStats.largest, thumbStats.largest);

  // Dexie/IndexedDB doesn't expose a direct byte size API, so metadata
  // storage is estimated from row counts - a reasonable proxy, clearly
  // labeled as an estimate rather than presented as an exact figure.
  const [memberCount, categoryCount, typeCount, documentCount, syncCount, notifCount] = await Promise.all([
    this.members.count(),
    this.categories.count(),
    this.types.count(),
    this.documents.count(),
    this.syncQueue.count(),
    this.notifications.count()
  ]);

  const estimatedRowBytes = 512; // rough average metadata row size
  const databaseSizeEstimateBytes =
    (memberCount + categoryCount + typeCount + documentCount + syncCount + notifCount) * estimatedRowBytes;

  return {
    vaultBytes: vaultStats.bytes,
    thumbnailBytes: thumbStats.bytes,
    fileCount,
    largestFileBytes,
    averageFileBytes: fileCount > 0 ? Math.round(totalBytes / fileCount) : 0,
    databaseSizeEstimateBytes
  };
}

// =====================================
// CLEAR THUMBNAIL CACHE ONLY (Settings → Maintenance)
// =====================================

async clearThumbnailCacheOnly(): Promise<void> {

  try {

    const result = await Filesystem.readdir({ path: 'thumbnails', directory: Directory.Data });

    for (const file of result.files) {
      if (file.type === 'file') {
        await Filesystem.deleteFile({ path: `thumbnails/${file.name}`, directory: Directory.Data });
      }
    }

  } catch {
    // nothing cached - fine
  }

  const allDocs = await this.documents.toArray();

  for (const doc of allDocs) {
    if (doc.thumbnail_path) {
      await this.documents.update(doc.id, { thumbnail_path: null });
    }
  }
}

// =====================================
// RESET ALL LOCAL DATA (Phase 10 - Reset Vault)
// Wipes every local table. Does NOT touch Google Drive - files already
// uploaded remain there. This is the local-device side of a vault reset;
// the caller is also responsible for clearing the vault salt/check from
// secure storage and the cached DocVault folder id.
// =====================================

async resetAllLocalData(): Promise<void> {

  await this.members.clear();
  await this.categories.clear();
  await this.types.clear();
  await this.documents.clear();
  await this.syncQueue.clear();

  for (const dir of ['vault', 'thumbnails']) {

    try {

      const result =
        await Filesystem.readdir({
          path: dir,
          directory: Directory.Data
        });

      for (const file of result.files) {

        if (file.type === 'file') {

          await Filesystem.deleteFile({
            path: `${dir}/${file.name}`,
            directory: Directory.Data
          });
        }
      }

    } catch {
      // nothing there - fine
    }
  }

  console.log('All local data wiped');
}

}