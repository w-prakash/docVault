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

    console.log(
      '✅ OfflineVault initialized'
    );
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


}