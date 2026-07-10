import { Component, OnDestroy } from '@angular/core';
import { IonicModule, ActionSheetController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import * as pdfjsLib from 'pdfjs-dist';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { AlertController } from '@ionic/angular';
import { ToastController } from '@ionic/angular';
import { decryptData } from 'src/app/utils/encryption.util';
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';
import { VaultService } from '../../services/vault.service';
import { OfflineVaultService } from 'src/app/services/offline-vault.service';
import { Router } from '@angular/router';
import { SyncStatusService } from 'src/app/services/sync-status';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ChangeDetectorRef
} from '@angular/core';
import {
  Filesystem,
  Directory
} from '@capacitor/filesystem';

import {
  Share
} from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
// ── Types ──────────────────────────────────────────────────────────────────────

interface DocumentItem {
  id: number;                  // Dexie auto-increment key
  server_id?: string | null;   // Supabase record id (set after sync)
  file_url: string;            // local filename OR server storage path
  created_at: string;
  file_type?: string;
  members?: any;
  categories?: any;
  types?: any;
  isDeleting?: boolean;
  isRestoring?: boolean;
  preview?: string;
  local_path?: string | null;
  local_file_name?: string;
  local_only?: boolean;
  synced?: boolean;
  sync_pending?: boolean;
  sync_failed?: boolean;
  member_id?: string;
  category_id?: string;
  type_id?: string;
  original_name?: string;
  thumbnail_path?: string;
}

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './documents.page.html',
  styleUrls: ['./documents.page.scss'],
})
export class DocumentsPage implements OnDestroy {

  // ── Public state ───────────────────────────────────────────────────────────

  documents: DocumentItem[] = [];
  allDocuments: DocumentItem[] = [];
  members: any[] = [];
  categories: any[] = [];
  types: any[] = [];
  allTypes: any[] = [];

  selectedMember: string = '';
  selectedCategory: string = '';
  selectedType: string = '';
  searchText: string = '';
  sortOrder: string = 'latest';
  suggestions: string[] = [];

  isLoading = true;
  isSyncing = false;
  syncMessage = '';
  isOnlineState = true;
  lastSync = '';

  selectedDocUrl: string = '';
  safeUrl!: SafeResourceUrl;
  isPreviewOpen = false;
  isPdf = false;

  pendingDelete: DocumentItem | null = null;
  deleteTimeout: any;
  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Blob URLs created during sync (for thumbnail generation).
   * All are revoked in ngOnDestroy to prevent memory leaks.
   */
  private syncBlobUrls: string[] = [];

  /** Prevents concurrent sync runs. */
  private isSyncRunning = false;
private isQueueProcessing = false;
  /** Completes on destroy to auto-unsubscribe all observables. */
  private destroy$ = new Subject<void>();

  // ── Constructor ────────────────────────────────────────────────────────────

  constructor(
    private offlineVault: OfflineVaultService,
    private supabaseService: SupabaseService,
    private sanitizer: DomSanitizer,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private location: Location,
    private router: Router,
    private syncStatus: SyncStatusService,
    private vaultService: VaultService,
    private toastCtrl: ToastController,
    private cdr: ChangeDetectorRef
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async ngOnInit() {
    // Subscribe with auto-cleanup on destroy
    this.syncStatus.isOnline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => { this.isOnlineState = v; });

    this.syncStatus.isSyncing$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => { this.isSyncing = v; });

    this.syncStatus.syncMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => { this.syncMessage = v; });

    this.syncStatus.lastSync$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => { this.lastSync = v; });

    if (!navigator.onLine) {
      // ── Offline bootstrap ──────────────────────────────────────────────────
      this.members    = await this.offlineVault.getMembers();
      this.categories = await this.offlineVault.getCategories();
      this.allTypes   = await this.offlineVault.getTypes();
      this.types      = [...this.allTypes];
      await this.loadOfflineDocuments();
      return;
    }

    // ── Online bootstrap ───────────────────────────────────────────────────
    // Non-blocking: process any queued offline uploads in the background
    // this.processSyncQueue();
await this.loadMasterData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.revokeSyncBlobUrls();
  }

  async ionViewWillEnter() {
    await this.loadDocuments();
  }


// ─────────────────────────────────────
// LOAD MASTER DATA
// ─────────────────────────────────────

async loadMasterData() {

  try {

    // ─────────────────────────────
    // LOAD CACHE FIRST
    // ─────────────────────────────

    this.members =
      await this.offlineVault
        .getMembers();

    this.categories =
      await this.offlineVault
        .getCategories();

    this.allTypes =
      await this.offlineVault
        .getTypes();

    this.types = [
      ...this.allTypes
    ];

    console.log(
      '⚡ Loaded master data from cache'
    );

    // ─────────────────────────────
    // OFFLINE STOP
    // ─────────────────────────────

    if (!navigator.onLine) {
      return;
    }

    // ─────────────────────────────
    // CACHE EXISTS → NO API
    // ─────────────────────────────

    if (
      this.members.length &&
      this.categories.length &&
      this.allTypes.length
    ) {

      console.log(
        '✅ Master cache already exists'
      );

      return;
    }

    // ─────────────────────────────
    // FETCH ONLINE ONLY IF EMPTY
    // ─────────────────────────────

    console.log(
      '🌐 Fetching master data'
    );

    const [
      typesRes,
      membersRes,
      categoriesRes
    ] = await Promise.all([

      this.supabaseService
        .getAllTypes(),

      this.supabaseService
        .getMembers(),

      this.supabaseService
        .getCategories()
    ]);

    if (typesRes.data) {

      this.allTypes =
        typesRes.data;

      this.types =
        [...typesRes.data];

      await this.offlineVault
        .saveTypes(
          typesRes.data
        );
    }

    if (membersRes.data) {

      this.members =
        membersRes.data;

      await this.offlineVault
        .saveMembers(
          membersRes.data
        );
    }

    if (categoriesRes.data) {

      this.categories =
        categoriesRes.data;

      await this.offlineVault
        .saveCategories(
          categoriesRes.data
        );
    }

    console.log(
      '✅ Master data synced'
    );

  } catch (e) {

    console.error(
      '❌ Master data load failed',
      e
    );
  }
}

  // ── Load ───────────────────────────────────────────────────────────────────
async loadDocuments() {

  this.isLoading = true;

  // ─────────────────────────────
  // LOAD LOCAL FIRST
  // ─────────────────────────────

  await this.loadOfflineDocuments();

  this.isLoading = false;
const localCount =
  await this.offlineVault
    .documents
    .count();

console.log(
  '📦 LOCAL DOC COUNT:',
  localCount
);
  // ─────────────────────────────
  // ONLINE SYNC
  // ─────────────────────────────

if (

  navigator.onLine &&

  (
    localCount === 0 ||

    this.shouldSync()
  ) &&

  !this.isSyncRunning &&

  !this.isQueueProcessing
){

    // 1️⃣ upload pending queue
    await this.processSyncQueue();

    // 2️⃣ fetch latest server docs
    await this.syncOnlineDocuments();

    // 3️⃣ FINAL SINGLE UI REFRESH
    await this.loadOfflineDocuments();
  }
}
// async loadDocuments() {

//   this.isLoading = true;

//   // ─────────────────────────────
//   // LOAD LOCAL FIRST
//   // ─────────────────────────────

//   await this.loadOfflineDocuments();

//   this.isLoading = false;

//   // ─────────────────────────────
//   // OFFLINE STOP
//   // ─────────────────────────────

//   if (!navigator.onLine) {
//     return;
//   }

//   // ─────────────────────────────
//   // PROCESS QUEUE FIRST
//   // ─────────────────────────────

//   await this.processSyncQueue();

//   // ─────────────────────────────
//   // THEN SERVER SYNC
//   // ─────────────────────────────

//   if (this.shouldSync()) {

//     await this.syncOnlineDocuments();
//   }
// }

  // ── Online sync ────────────────────────────────────────────────────────────

// ─────────────────────────────────────
// ONLINE SYNC
// ─────────────────────────────────────

// async syncOnlineDocuments() {

//   if (this.isSyncRunning) {

//     console.log(
//       '⏳ Sync already running'
//     );

//     return;
//   }

//   this.isSyncRunning = true;

//   this.syncStatus.setSyncing(
//     true,
//     'Syncing documents...'
//   );

//   try {

//     const { data } =
//       await this.supabaseService
//         .getDocuments();

//     if (!data) {

//       throw new Error(
//         'No data returned'
//       );
//     }

//     const offlineDocs: any[] = [];

//     const totalDocs =
//       data.length;

//     let processed = 0;

//     // ─────────────────────────────────
//     // METADATA ONLY
//     // ─────────────────────────────────

//     for (const doc of data as any[]) {

//       try {

//         const fileName =
//           doc.file_url
//             ?.split('/')
//             ?.pop();

//         if (!fileName) {
//           continue;
//         }

//         // ─────────────────────────────
//         // CHECK LOCAL CACHE
//         // ─────────────────────────────

//         const exists =
//           await this.offlineVault
//             .fileExists(
//               fileName
//             );

//         // ─────────────────────────────
//         // RESTORE THUMBNAIL
//         // ─────────────────────────────

//         if (exists) {

//           await this.attachThumbnail(
//             doc,
//             fileName
//           );
//         }

//         // ─────────────────────────────
//         // SAVE ONLY METADATA
//         // ─────────────────────────────

//         offlineDocs.push({

//           ...doc,

//           original_name:
//             fileName
//               .split('_')
//               .slice(1)
//               .join('_')
//               .replace('.enc', ''),

//           local_path:
//             exists
//               ? `vault/${fileName}`
//               : null,

//           thumbnail_path:
//             `thumbnails/${fileName}.thumb`,

//           synced: true,

//           local_only: false,

//           sync_pending: false,

//           sync_failed: false
//         });

//         processed++;

//         this.syncStatus.setSyncing(
//           true,
//           `Syncing ${processed}/${totalDocs}`
//         );

//       } catch (docErr) {

//         console.error(
//           '❌ Metadata sync failed',
//           docErr
//         );
//       }
//     }

//     // ─────────────────────────────────
//     // SAVE TO DEXIE
//     // ─────────────────────────────────

//     for (const offlineDoc of offlineDocs) {

//       const existing =
//         await this.offlineVault
//           .documents
//           .where('server_id')
//           .equals(
//             offlineDoc.id
//           )
//           .first();

//       // NEW DOC

//       if (!existing) {

//         await this.offlineVault
//           .saveLocalDocument({

//             ...offlineDoc,

//             server_id:
//               offlineDoc.id
//           });
//       }

//       // UPDATE EXISTING

//       else {

//         await this.offlineVault
//           .documents
//           .update(
//             existing.id,
//             {

//               ...offlineDoc,

//               server_id:
//                 offlineDoc.id
//             }
//           );
//       }
//     }

//     // ─────────────────────────────────
//     // LOAD LOCAL DOCS
//     // ─────────────────────────────────

//     await this.loadOfflineDocuments();

//     console.log(
//       '✅ Metadata sync completed'
//     );

//   } catch (e) {

//     console.error(
//       '❌ Sync failed',
//       e
//     );

//   } finally {

//     this.isSyncRunning = false;

//     this.syncStatus
//       .setSyncing(false);

//     this.syncStatus
//       .setLastSyncNow();

//     localStorage.setItem(
//       'last_sync_time',
//       Date.now().toString()
//     );
//   }
// }

// ─────────────────────────────────────
// ONLINE SYNC
// ─────────────────────────────────────

async syncOnlineDocuments() {

  // ─────────────────────────────────
  // PREVENT DUPLICATE SYNC
  // ─────────────────────────────────

  if (this.isSyncRunning) {

    console.log(
      '⏳ Sync already running'
    );

    return;
  }

  this.isSyncRunning = true;

  this.syncStatus.setSyncing(
    true,
    'Syncing documents...'
  );

  try {

    // ───────────────────────────────
    // FETCH SERVER DOCS
    // ───────────────────────────────

// ───────────────────────────────
// CHECK LOCAL DATABASE
// ───────────────────────────────

const localCount =
  await this.offlineVault
    .documents
    .count();

console.log(
  '📦 LOCAL DOC COUNT:',
  localCount
);

let response;

// ───────────────────────────────
// FIRST INSTALL
// ───────────────────────────────

if (localCount === 0) {

  console.log(
    '🌐 FULL FIRST SYNC'
  );

  response =
    await this.supabaseService
      .getDocuments();
}

// ───────────────────────────────
// INCREMENTAL SYNC
// ───────────────────────────────

else {

  console.log(
    '⚡ INCREMENTAL SYNC'
  );

  const lastSync =
    localStorage.getItem(
      'last_sync_time'
    );

  response =
    await this.supabaseService
      .getDocuments(
        lastSync || undefined
      );
}

const {
  data,
  error
} = response;

    if (error) {

      throw error;
    }

    if (!data) {

      throw new Error(
        'No documents found'
      );
    }

    const total =
      data.length;

    let processed = 0;
// ───────────────────────────────
// LOAD LOCAL DOCS ONCE
// ───────────────────────────────

const localDocs =
  await this.offlineVault
    .documents
    .toArray();

// ───────────────────────────────
// CREATE FAST LOOKUP MAP
// ───────────────────────────────

const localMap =
  new Map(

    localDocs.map(doc => [

      doc.server_id,

      doc
    ])
  );
    // ───────────────────────────────
    // PROCESS EACH DOC
    // ───────────────────────────────

    for (const serverDoc of data) {

      try {

        const fileName = 
          serverDoc.file_url
            ?.split('/')
            ?.pop();

        if (!fileName) {
          continue;
        }

        // ───────────────────────────
        // CHECK LOCAL CACHE
        // ───────────────────────────

        const exists =
          await this.offlineVault
            .fileExists(
              fileName
            );

        // ───────────────────────────
        // FIND EXISTING DEXIE DOC
        // ───────────────────────────

const existing =
  localMap.get(
    serverDoc.id
  );

        // ───────────────────────────
        // NORMALIZED DOCUMENT
        // ───────────────────────────

        const normalizedDoc = {

          // 🔥 NEVER TOUCH Dexie id

          server_id:
            serverDoc.id,

          file_url:
            serverDoc.file_url,

          created_at:
            serverDoc.created_at,

          file_type:
            serverDoc.file_type,

          members:
            serverDoc.members,

          categories:
            serverDoc.categories,

          types:
            serverDoc.types,

          original_name:
            fileName
              .split('_')
              .slice(1)
              .join('_')
              .replace('.enc', ''),

          local_path:
            exists
              ? `vault/${fileName}`
              : null,

          thumbnail_path:
            `thumbnails/${fileName}.thumb`,

          synced: true,

          local_only: false,

          sync_pending: false,

          sync_failed: false
        };

        // ───────────────────────────
        // RESTORE THUMBNAIL
        // ───────────────────────────

        if (exists) {

          await this.attachThumbnail(
            normalizedDoc,
            fileName
          );
        }

        // ───────────────────────────
        // INSERT
        // ───────────────────────────
console.log(
  '━━━━━━━━━━━━━━'
);

console.log(
  'SERVER DOC ID:',
  serverDoc.id
);

console.log(
  'FOUND EXISTING:',
  existing
);

const allDocs =
  await this.offlineVault
    .documents
    .toArray();

console.log(
  'ALL LOCAL DOCS:',
  allDocs
);

console.log(
  '━━━━━━━━━━━━━━'
);
        if (!existing) {

          await this.offlineVault
            .saveLocalDocument(
              normalizedDoc
            );
        }

        // ───────────────────────────
        // UPDATE
        // ───────────────────────────

        else {

          await this.offlineVault
            .documents
            .update(
              existing.id,
              normalizedDoc
            );
        }

        processed++;

        this.syncStatus.setSyncing(

          true,

          `Syncing ${processed}/${total}`
        );

      } catch (docErr) {

        console.error(
          '❌ Document sync failed',
          docErr
        );
      }
    }

    // ───────────────────────────────
    // RELOAD LOCAL DOCS
    // ───────────────────────────────

    await this.loadOfflineDocuments();

    console.log(
      '✅ Metadata sync completed'
    );

  } catch (e) {

    console.error(
      '❌ Sync failed',
      e
    );

  } finally {

    this.isSyncRunning = false;

    this.syncStatus
      .setSyncing(false);

    this.syncStatus
      .setLastSyncNow();

localStorage.setItem(
  'last_sync_time',
  new Date().toISOString()
);
  }
}

  // ── Offline load ───────────────────────────────────────────────────────────

  async loadOfflineDocuments() {
    console.log('📦 Loading local docs');

    // getDocuments() already orders by created_at DESC
    const offlineDocs = await this.offlineVault.getDocuments();

    this.documents    = [...offlineDocs];
    this.allDocuments = [...offlineDocs];
    this.isLoading    = false;

    // Load thumbnails progressively in the background; each one refreshes the list
    // for (const doc of offlineDocs) {
    //   try {
    //     const fileName = doc.file_url?.split('/')?.pop();
    //     if (!fileName) continue;
    //     await this.attachThumbnail(doc, fileName);
    //     this.documents = [...this.documents]; // trigger change detection
    //   } catch (e) {
    //     console.error('❌ Thumbnail load failed', e);
    //   }
    // }
    // ─────────────────────────────────────
// LOAD THUMBNAILS IN PARALLEL
// ─────────────────────────────────────

// ─────────────────────────────────────
// LOAD THUMBNAILS IN PARALLEL
// ─────────────────────────────────────

const docsWithoutPreview =

  offlineDocs.filter(
    doc => !doc.preview
  );

await Promise.all(

  offlineDocs.map(
    async (doc) => {

      try {

        const fileName =
          doc.file_url
            ?.split('/')
            ?.pop();

        if (!fileName) {
          return;
        }

        await this.attachThumbnail(
          doc,
          fileName
        );

      } catch (e) {

        console.error(
          '❌ Thumbnail load failed',
          e
        );
      }
    }
  )
);

console.log(
  '✅ THUMB LOOP COMPLETED'
);

this.documents =
  [...offlineDocs];

this.allDocuments =
  [...offlineDocs];

// 🔥 refresh UI once
// this.documents = [
//   ...this.documents
// ];
this.cdr.detectChanges();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Reads the cached thumbnail for a doc and sets doc.preview.
   * offlineVault.readThumbnail prepends 'thumbnails/' internally,
   * so we pass only the bare filename + '.thumb'.
   */
private async attachThumbnail(
  doc: any,
  fileName: string
): Promise<void> {

  console.log('━━━━━━━━━━━━━━━━━━');

  console.log(
    '🖼 ATTACH THUMB START'
  );

  console.log(
    '📄 FILE NAME:',
    fileName
  );

  console.log(
    '📄 FILE URL:',
    doc.file_url
  );

  console.log(
    '📄 LOCAL PATH:',
    doc.local_path
  );

  console.log(
    '📄 THUMB PATH:',
    doc.thumbnail_path
  );

  // ─────────────────────────────
  // ALREADY LOADED
  // ─────────────────────────────

  if (doc.preview) {

    console.log(
      '⚡ PREVIEW ALREADY EXISTS'
    );

    console.log(
      'PREVIEW TYPE:',
      typeof doc.preview
    );

    console.log(
      'PREVIEW VALUE:',
      doc.preview
    );

    return;
  }

  // ─────────────────────────────
  // READ THUMB
  // ─────────────────────────────

  const thumb =
    await this.offlineVault
      .readThumbnail(
        fileName + '.thumb'
      );

  console.log(
    '🖼 THUMB EXISTS?',
    !!thumb
  );

if (!thumb) {

  console.log(
    '⚠️ THUMB NOT FOUND'
  );

  console.log(
    '☁️ DOWNLOADING FILE FOR THUMB'
  );

  const ready =
    await this.ensureLocalFile(doc);

  console.log(
    '📦 FILE READY?',
    ready
  );

  if (!ready) {

    console.log(
      '❌ FILE DOWNLOAD FAILED'
    );

    return;
  }

  console.log(
    '🔁 RETRYING THUMB LOAD'
  );

  const regeneratedThumb =
    await this.offlineVault
      .readThumbnail(
        fileName + '.thumb'
      );

  console.log(
    '🖼 REGENERATED THUMB EXISTS?',
    !!regeneratedThumb
  );

  if (!regeneratedThumb) {

    console.log(
      '❌ THUMB REGEN FAILED'
    );

    return;
  }

  const finalMime =
    doc.file_type ||
    'image/jpeg';

  doc.preview =
    `data:${finalMime};base64,${regeneratedThumb}`;

  console.log(
    '✅ REGENERATED PREVIEW ASSIGNED'
  );

  return;
}

  console.log(
    '🖼 THUMB LENGTH:',
    thumb.length
  );

  // ─────────────────────────────
  // MIME TYPE
  // ─────────────────────────────

  const finalMime =
    doc.file_type ||
    'image/jpeg';

  console.log(
    '📄 MIME TYPE:',
    finalMime
  );

  // ─────────────────────────────
  // ASSIGN STRING ONLY
  // ─────────────────────────────

  const previewString =
    `data:${finalMime};base64,${thumb}`;

  console.log(
    '📄 PREVIEW STRING TYPE:',
    typeof previewString
  );

  console.log(
    '📄 PREVIEW SAMPLE:',
    previewString.substring(0, 80)
  );

  // 🔥 IMPORTANT
  // ALWAYS STRING
  doc.preview =
    String(previewString);

  console.log(
    '✅ PREVIEW ASSIGNED'
  );

  console.log(
    '📄 FINAL PREVIEW TYPE:',
    typeof doc.preview
  );

  console.log(
    '📄 FINAL PREVIEW VALUE:',
    doc.preview
  );

  console.log('━━━━━━━━━━━━━━━━━━');
}

  /**
   * Generates a thumbnail from a decrypted blob URL and persists it.
   * Handles both images and PDFs.
   */
  private async generateAndCacheThumbnail(
    doc: any,
    fileName: string,
    blobUrl: string,
  ): Promise<void> {
    try {
      let base64: string;

const isPdfFile =

  doc.file_type === 'application/pdf'

  ||

  fileName
    .toLowerCase()
    .includes('.pdf');
console.log(
  '📄 PDF CHECK:',
  {
    fileName,
    fileType: doc.file_type,
    isPdfFile
  }
);
      if (isPdfFile) {
        const dataUrl = await this.generatePdfThumbnail(blobUrl);
        base64        = dataUrl.split(',')[1];
        doc.preview   = dataUrl;
      } else {
        const response = await fetch(blobUrl);
        const blob     = await response.blob();
        base64         = await this.blobToBase64(blob);
        doc.preview    = `data:image/jpeg;base64,${base64}`;
      }

      await this.offlineVault.saveThumbnail(fileName + '.thumb', base64);
    } catch (e) {
      console.error('❌ Thumbnail cache error', e);
    }
  }

  /** Converts a Blob to raw base64 (no data-url prefix). */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader     = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror   = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Builds the Dexie metadata object for a server-side document.
   * Strips the userId/timestamp prefix and .enc suffix to get the original filename.
   */
  private buildOfflineMeta(doc: any, fileName: string, localPath: string | null): any {
    // Server filename: timestamp_originalName.enc  (after userId/ is stripped by split('/').pop())
    const originalName = fileName.split('_').slice(1).join('_').replace('.enc', '');
    return {
      ...doc,
      original_name:  originalName,
      local_path:     localPath,
      thumbnail_path: `thumbnails/${fileName}.thumb`,
      synced:         true,
      local_only:     false,
      sync_pending:   false,
      sync_failed:    false,
    };
  }

  /** Revokes all blob URLs created during sync. */
  private revokeSyncBlobUrls(): void {
    for (const url of this.syncBlobUrls) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    this.syncBlobUrls = [];
  }

  // ── PDF thumbnail ──────────────────────────────────────────────────────────

  async generatePdfThumbnail(url: string): Promise<string> {
    const pdf      = await pdfjsLib.getDocument(url).promise;
    const page     = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas   = document.createElement('canvas');
    const context  = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');

    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    await (page as any).render({ canvasContext: context, viewport, canvas }).promise;
    return canvas.toDataURL();
  }

  // ── Action sheet ───────────────────────────────────────────────────────────

  async openMenu(doc: DocumentItem) {
    const sheet = await this.actionSheetCtrl.create({
      header:   'Options',
      cssClass: 'vault-action-sheet',
      buttons: [
        { text: 'View',     icon: 'eye-outline',          handler: () => this.viewDoc(doc) },
        { text: 'Download', icon: 'download-outline',     handler: () => this.downloadDoc(doc) },
        { text: 'Share',    icon: 'share-social-outline', handler: () => this.shareDoc(doc) },
        { text: 'Delete',   icon: 'trash-outline', role: 'destructive', handler: () => this.confirmDelete(doc) },
        { text: 'Cancel',   icon: 'close-outline', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  // ── View ───────────────────────────────────────────────────────────────────

async viewDoc(
  doc: DocumentItem
) {

  try {

    // ───────────────────────────────
    // ENSURE LOCAL CACHE
    // ───────────────────────────────

    const ready =
      await this.ensureLocalFile(
        doc
      );

    if (!ready) {

      await this.showToast(
        'Unable to load file',
        'danger'
      );

      return;
    }

    const key =
      this.vaultService
        .currentKey;

    const fileName =   doc.local_file_name ||
      doc.file_url
        .split('/')
        .pop();

    if (!fileName) {

      return;
    }

    const encryptedText =
      await this.offlineVault
        .readEncryptedFile(
          fileName
        );

    if (!encryptedText) {

      await this.showToast(
        'File missing',
        'danger'
      );

      return;
    }

    const decrypted =
      decryptData(
        encryptedText,
        key
      );

    const safeBuffer =
      new Uint8Array(
        decrypted
      ).buffer;

const isPdf =
  doc.file_type ===
  'application/pdf';
console.log(
  '📄 FILE TYPE:',
  doc.file_type
);

console.log(
  '📄 IS PDF:',
  isPdf
);
    const mimeType =
      doc.file_type ||
      (
        isPdf
          ? 'application/pdf'
          : 'application/octet-stream'
      );

    const blob =
      new Blob(
        [safeBuffer],
        {
          type: mimeType
        }
      );
console.log(
  '📄 BLOB SIZE:',
  blob.size
);

console.log(
  '📄 MIME TYPE:',
  mimeType
);
    const url =
      URL.createObjectURL(
        blob
      );
console.log(
  '📄 OBJECT URL:',
  url
);
    this.selectedDocUrl =
      url;

    this.isPdf =
      isPdf;

if (isPdf) {

  console.log(
    '📄 OPENING PDF NATIVELY'
  );

  const base64 =
    this.arrayBufferToBase64(
      safeBuffer
    );

  const tempFile =
    `preview_${Date.now()}.pdf`;

  await Filesystem.writeFile({

    path: tempFile,

    data: base64,

    directory:
      Directory.Cache
  });

  const uri =
    await Filesystem.getUri({

      path: tempFile,

      directory:
        Directory.Cache
    });

  console.log(
    '📄 PDF URI:',
    uri.uri
  );

  await Share.share({

    title: 'Open PDF',

    url: uri.uri
  });

  return;
}

    this.isPreviewOpen =
      true;

  } catch (e) {

    console.error(
      '❌ View error',
      e
    );

    await this.showToast(
      'Unable to open file',
      'danger'
    );
  }
}
onPdfLoad() {

  console.log(
    '✅ PDF iframe loaded'
  );
}

private arrayBufferToBase64(
  buffer: ArrayBuffer
): string {

  let binary = '';

  const bytes =
    new Uint8Array(buffer);

  const len =
    bytes.byteLength;

  for (let i = 0; i < len; i++) {

    binary +=
      String.fromCharCode(
        bytes[i]
      );
  }

  return btoa(binary);
}

onPdfError() {

  console.log(
    '❌ PDF iframe failed'
  );
}
  closePreview() {
    this.isPreviewOpen = false;
    if (this.selectedDocUrl) {
      URL.revokeObjectURL(this.selectedDocUrl);
      this.selectedDocUrl = '';
    }
  }

  // ── Download ───────────────────────────────────────────────────────────────

// ── Download ───────────────────────────────────────────────────────────────

async downloadDoc(
  doc: DocumentItem
) {

  try {

    // ───────────────────────────────
    // ENSURE LOCAL CACHE
    // ───────────────────────────────

    const ready =
      await this.ensureLocalFile(
        doc
      );

    if (!ready) {

      await this.showToast(
        'Unable to load file',
        'danger'
      );

      return;
    }

    // ───────────────────────────────
    // GET DECRYPTED BLOB
    // ───────────────────────────────

    const blob =
      await this.getDecryptedBlob(
        doc
      );

    if (!blob) {
      return;
    }

    // ───────────────────────────────
    // FILE NAME
    // ───────────────────────────────

const fileName =
  doc.original_name
  || 'file';

    // ───────────────────────────────
    // DOWNLOAD
    // ───────────────────────────────

const isMobile =
  Capacitor.isNativePlatform();

if (!isMobile) {

  // 🌐 Browser

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement('a');

  a.href =
    url;

  a.download =
    fileName;

  a.click();

  URL.revokeObjectURL(url);

} else {

  // 📱 Mobile

  const base64 =
    await this.blobToBase64String(
      blob
    );

  await Filesystem.writeFile({

    path: fileName,

    data: base64,

    directory:
      Directory.Documents
  });

  await this.showToast(
    'File saved to Documents'
  );
}
    console.log(
      '✅ DOWNLOAD SUCCESS'
    );

  } catch (e) {

    console.error(
      '❌ Download error',
      e
    );

    await this.showToast(
      'Download failed',
      'danger'
    );
  }
}
  // ── Share ──────────────────────────────────────────────────────────────────

// ── Share ──────────────────────────────────────────────────────────────────

async shareDoc(
  doc: DocumentItem
) {

  try {

    // ───────────────────────────────
    // ENSURE LOCAL CACHE
    // ───────────────────────────────

    const ready =
      await this.ensureLocalFile(
        doc
      );

    if (!ready) {

      await this.showToast(
        'Unable to load file',
        'danger'
      );

      return;
    }

    const blob =
      await this.getDecryptedBlob(
        doc
      );

    if (!blob) {
      return;
    }

const fileName =
  doc.original_name
  || 'file';

const isMobile =
  Capacitor.isNativePlatform();

if (!isMobile) {

  // 🌐 Browser

  const file =
    new File(
      [blob],
      fileName,
      {
        type: blob.type
      }
    );

  if (
    navigator.canShare?.({
      files: [file]
    })
  ) {

    await navigator.share({

      files: [file],

      title: fileName
    });
  }

} else {

  // 📱 Mobile

  const base64 =
    await this.blobToBase64String(
      blob
    );

  await Filesystem.writeFile({

    path: fileName,

    data: base64,

    directory:
      Directory.Cache
  });

  const uri =
    await Filesystem.getUri({

      path: fileName,

      directory:
        Directory.Cache
    });

  await Share.share({

    title: fileName,

    url: uri.uri
  });
}

  } catch (e) {

    console.log(
      'Share dismissed',
      e
    );
  }
}


private async blobToBase64String(
  blob: Blob
): Promise<string> {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onloadend =
        () => {

          const base64 =
            (
              reader.result as string
            ).split(',')[1];

          resolve(base64);
        };

      reader.onerror =
        reject;

      reader.readAsDataURL(
        blob
      );
    }
  );
}
  // ── Filters ────────────────────────────────────────────────────────────────

  selectMember(member: string) {
    this.selectedMember = member;
    this.applyFilters();
  }

  selectCategory(category: string) {
    this.selectedCategory = category;
    this.types = category
      ? this.allTypes.filter(t => t.category_name === category)
      : [...this.allTypes];
    this.applyFilters();
  }

  selectType(type: string) {
    this.selectedType = type;
    this.applyFilters();
  }

  onSearchChange() {
    const search = this.searchText?.toLowerCase() || '';

    this.suggestions = search
      ? [...new Set(
          this.allDocuments
            .map(d => d.types?.name as string | undefined)
            .filter((name): name is string => !!name?.toLowerCase().includes(search))
        )]
      : [];

    this.applyFilters();
  }

  applyFilters() {
    let filtered = this.allDocuments.filter(doc => {
      const matchMember   = !this.selectedMember   || doc.members?.name    === this.selectedMember;
      const matchCategory = !this.selectedCategory || doc.categories?.name === this.selectedCategory;
      const matchType     = !this.selectedType     || doc.types?.name      === this.selectedType;
      const matchSearch   = !this.searchText
        || doc.types?.name?.toLowerCase().includes(this.searchText.toLowerCase());

      return matchMember && matchCategory && matchType && matchSearch;
    });

    filtered.sort((a, b) => {
      const d1 = new Date(a.created_at).getTime();
      const d2 = new Date(b.created_at).getTime();
      return this.sortOrder === 'latest' ? d2 - d1 : d1 - d2;
    });

    this.documents = filtered;
  }

  setSort(order: string) {
    this.sortOrder = order;
    this.applyFilters();
  }

  selectSuggestion(value: string) {
    this.searchText  = value;
    this.suggestions = [];
    (document.activeElement as HTMLElement)?.blur();
    this.applyFilters(); // called exactly once
  }

  highlight(text: string | undefined): SafeHtml {
    if (!text) return '';
    const search = this.searchText?.trim();
    if (!search) return text;

    const regex    = new RegExp(`(${search})`, 'gi');
    const replaced = text.replace(regex, `<span class="highlight">$1</span>`);
    return this.sanitizer.bypassSecurityTrustHtml(replaced);
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  isPdfFile(url: string): boolean {
    return url?.toLowerCase().includes('.pdf');
  }

  goBack() {
    this.location.back();
  }

  /** Single toast helper replaces all raw alert() calls throughout the class. */
  async showToast(message: string, color: 'success' | 'warning' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }

  // ── Delete / Undo ──────────────────────────────────────────────────────────

  async confirmDelete(doc: DocumentItem) {
    const alert = await this.alertCtrl.create({
      header:  'Delete Document',
      message: 'Are you sure you want to delete this file?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => this.deleteDocument(doc) },
      ],
    });
    await alert.present();
  }

  async deleteDocument(doc: DocumentItem) {
    // Remove from UI immediately for instant feedback
    this.allDocuments  = this.allDocuments.filter(d => d.id !== doc.id);
    this.documents     = [...this.allDocuments];
    this.pendingDelete = doc;

    await this.showUndoToast();

    this.deleteTimeout = setTimeout(async () => {
      await this.finalDelete(doc);
      this.pendingDelete = null;
    }, 4000);
  }

  async finalDelete(doc: DocumentItem) {
    try {
      // Always remove from Dexie first (works offline too)
      await this.offlineVault.documents.delete(doc.id);

      // Only call Supabase if the doc was synced to the server and we are online
      if (!doc.local_only && navigator.onLine) {
let path =
  doc.file_url;
          if (path.includes('http')) {
          path = path.split('/documents/')[1];
        }
        await this.supabaseService.deleteFile(path);
        // Use server_id if available, otherwise fall back to the server-assigned id on the doc
        const serverId = doc.server_id || (doc as any).id;
        if (serverId) {
          await this.supabaseService.deleteRecord(serverId);
        }
      }

      await this.showToast('Document deleted');
    } catch (err) {
      console.error('❌ Final delete error', err);
      await this.showToast('Delete failed — please try again', 'danger');
    }
  }

  undoDelete() {
    if (!this.pendingDelete) return;

    clearTimeout(this.deleteTimeout);

    const restored = { ...this.pendingDelete, isRestoring: true };
    this.allDocuments.unshift(restored);
    this.documents = [...this.allDocuments];

    setTimeout(() => { restored.isRestoring = false; }, 400);
    this.pendingDelete = null;
  }

  async showUndoToast() {
    const toast = await this.toastCtrl.create({
      message:  'Document deleted',
      duration: 4000,
      buttons:  [{ text: 'Undo', handler: () => this.undoDelete() }],
    });
    await toast.present();
  }

  // ── Decrypted blob ─────────────────────────────────────────────────────────

  async getDecryptedBlob(doc: DocumentItem): Promise<Blob | null> {
    try {
      const key      = this.vaultService.currentKey;
      const fileName = doc.local_file_name || doc.file_url.split('/').pop();
      if (!fileName) return null;

      // offlineVault.readEncryptedFile prepends 'vault/' — pass the bare filename
      const encryptedText = await this.offlineVault.readEncryptedFile(fileName);
      if (!encryptedText) {
        await this.showToast('File not cached — pull down to refresh', 'warning');
        return null;
      }

      const decrypted  = decryptData(encryptedText as string, key);
      const safeBuffer = new Uint8Array(decrypted).buffer;

      return new Blob([safeBuffer], {
        type: doc.file_type || 'application/octet-stream',
      });
    } catch (e) {
      console.error('❌ Blob creation failed', e);
      return null;
    }
  }

  // ── Sync queue ─────────────────────────────────────────────────────────────

  shouldSync(): boolean {
    if (localStorage.getItem('force_sync') === 'true') {
      localStorage.removeItem('force_sync');
      return true;
    }
    const last = localStorage.getItem('last_sync_time');
    if (!last) return true;
    return Date.now() - Number(last) > 5 * 60 * 1000;
  }

async processSyncQueue() {

  // ─────────────────────────────
  // PREVENT DUPLICATE RUNS
  // ─────────────────────────────

  if (this.isQueueProcessing) {

    console.log(
      '⏳ Queue already processing'
    );

    return;
  }

  this.isQueueProcessing = true;

  // ─────────────────────────────
  // OFFLINE
  // ─────────────────────────────
try {
  if (!navigator.onLine) {

    console.log(
      '📴 Offline — sync queue skipped'
    );

    this.isQueueProcessing = false;

    return;
  }

    const jobs = await this.offlineVault.syncQueue
      .where('status')
      .equals('pending')
      .toArray();

    console.log(`📦 Pending jobs: ${jobs.length}`);

    for (const job of jobs) {
      if (job.type !== 'upload') continue;

      try {
        const doc = await this.offlineVault.documents.get(job.document_id);
        if (!doc) {
          console.warn('⚠️ Local doc missing for sync job', job.id);
          continue;
        }

        // Upload page saves local docs with file_url = bare filename (e.g. 1234_doc.jpg.enc)
        // readEncryptedFile adds "vault/" itself, so pass the bare filename
        const localFileName = doc.local_file_name || doc.file_url.split('/').pop()!;
        const encryptedText = await this.offlineVault.readEncryptedFile(localFileName);

        if (!encryptedText) {
          console.error('❌ Encrypted file missing on disk for', localFileName);
          await this.offlineVault.syncQueue.update(job.id, { status: 'failed' });
          continue;
        }

const encryptedFile =
  new File(

    [encryptedText],

    // ✅ KEEP SAME LOCAL ENCRYPTED FILE NAME
    localFileName,

    {
      type: 'text/plain'
    }
  );
        const filePath = await this.supabaseService.uploadFile(encryptedFile);

        const { data, error } = await this.supabaseService.saveRecord({
          member_id:   doc.member_id,
          category_id: doc.category_id,
          type_id:     doc.type_id,
          file_url:    filePath,
          file_type:   doc.file_type,
          created_at:  doc.created_at || new Date().toISOString(),
        });

        if (error) {
          console.error('❌ saveRecord failed', error);
          await this.offlineVault.syncQueue.update(job.id, { status: 'failed' });
          continue;
        }

        // Mark local doc as synced
await this.offlineVault.documents.update(
  job.document_id,
  {

    // ✅ KEEP EXISTING LOCAL FILE
    local_path:
      doc.local_path,

    local_file_name: doc.local_file_name,

    thumbnail_path:
      doc.thumbnail_path,

    original_name:
      doc.original_name,

    // ✅ UPDATE SERVER VALUES
    server_id:
      (data as any)?.id ?? null,

    file_url:
      filePath,

    synced: true,

    sync_pending: false,

    sync_failed: false,

    local_only: false
  }
);

        await this.offlineVault.syncQueue.update(job.id, { status: 'completed' });

        // Ensure the next loadDocuments pull gets fresh server data
        localStorage.setItem('force_sync', 'true');

        console.log('✅ Sync queue job done for', doc.original_name);
      } catch (e) {
        console.error('❌ Sync queue job failed for job', job.id, e);
        await this.offlineVault.syncQueue.update(job.id, { status: 'failed' });
      }
    }
  }
   catch (e) {

    console.error(
      '❌ Queue processing failed',
      e
    );

  } finally {

    // ✅ ALWAYS RESET
    this.isQueueProcessing = false;
  }
    // await this.loadOfflineDocuments();
    console.log('🎉 Sync queue processing complete');
  }

  // ── Pull to refresh ────────────────────────────────────────────────────────

  async doRefresh(event: any) {
    try {
      localStorage.removeItem(
  'last_sync_time'
);
      await this.processSyncQueue();

      if (navigator.onLine) {
        await this.syncOnlineDocuments();
      } else {
        await this.loadOfflineDocuments();
      }
    } catch (e) {
      console.error('❌ Refresh failed', e);
    } finally {
      event.target.complete();
    }
  }

  // ─────────────────────────────────────
// ENSURE LOCAL FILE
// ─────────────────────────────────────

async ensureLocalFile(
  doc: any
): Promise<boolean> {

  try {

    const fileName =  doc.local_file_name ||
      doc.file_url
        ?.split('/')
        ?.pop();

    if (!fileName) {

      return false;
    }

    // ─────────────────────────────────
    // ALREADY CACHED
    // ─────────────────────────────────

    const exists =
      await this.offlineVault
        .fileExists(
          fileName
        );

    if (exists) {

      console.log(
        '⚡ Using existing cache',
        fileName
      );

      return true;
    }

    console.log(
      '☁️ Downloading file',
      fileName
    );

    // ─────────────────────────────────
    // GET SIGNED URL
    // ─────────────────────────────────

    const signedUrl =
      await this.supabaseService
        .getSignedUrl(doc.file_url);

    if (!signedUrl) {

      return false;
    }

    // ─────────────────────────────────
    // DOWNLOAD ENCRYPTED FILE
    // ─────────────────────────────────

    const res =
      await fetch(
        signedUrl
      );

    const encryptedText =
      await res.text();

    // ─────────────────────────────────
    // SAVE LOCAL FILE
    // ─────────────────────────────────

    const localPath =
      await this.offlineVault
        .saveEncryptedFile(
          fileName,
          encryptedText
        );

    // ─────────────────────────────────
    // UPDATE DEXIE
    // ─────────────────────────────────

    await this.offlineVault
      .documents
      .update(
        doc.id,
        {
          local_path:
            localPath
        }
      );

    // ─────────────────────────────────
    // GENERATE THUMBNAIL ONCE
    // ─────────────────────────────────

    try {

      const key =
        this.vaultService
          .currentKey;

      const decrypted =
        decryptData(
          encryptedText,
          key
        );

      const safeBuffer =
        new Uint8Array(
          decrypted
        ).buffer;

      const mimeType =
        doc.file_type ||
        'application/octet-stream';

      const blob =
        new Blob(
          [safeBuffer],
          {
            type: mimeType
          }
        );

      const blobUrl =
        URL.createObjectURL(
          blob
        );

      await this
        .generateAndCacheThumbnail(
          doc,
          fileName,
          blobUrl
        );

      URL.revokeObjectURL(
        blobUrl
      );

    } catch (thumbErr) {

      console.error(
        '❌ Thumbnail generation failed',
        thumbErr
      );
    }

    console.log(
      '✅ File cached locally'
    );

    return true;

  } catch (e) {

    console.error(
      '❌ ensureLocalFile failed',
      e
    );

    return false;
  }
}
}