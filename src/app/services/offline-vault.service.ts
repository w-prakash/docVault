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
// STORAGE USED (Phase 10)
// =====================================

async getLocalStorageUsage(): Promise<{
  documentCount: number;
  cachedFileCount: number;
  totalBytes: number;
}> {

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