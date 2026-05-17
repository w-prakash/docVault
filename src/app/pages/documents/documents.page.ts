import { Component } from '@angular/core';
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
import {
  Filesystem,
  Directory
} from '@capacitor/filesystem';
import {
  OfflineVaultService
} from 'src/app/services/offline-vault.service';
import {
  Share
} from '@capacitor/share';
import { Router } from '@angular/router';
import { SyncStatusService } from 'src/app/services/sync-status';
// ✅ TYPES (IMPORTANT)
type Member = { name: string };
type Category = { name: string };
type TypeItem = { name: string };

interface DocumentItem {
  id: string;
  file_url: string;
  created_at: string;
  file_type?: string;
  members?: any;      // ✅ keep array
  categories?: any;
  types?: any;
  isDeleting?: boolean; // ✅ ADD THIS
  isRestoring?: boolean; // ✅ add this

  preview?: string;
}

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './documents.page.html',
  styleUrls: ['./documents.page.scss'],
})
export class DocumentsPage {
  pendingDelete: any = null;
deleteTimeout: any;
sortOrder: string = 'latest';
suggestions: string[] = [];
  documents: DocumentItem[] = [];
isLoading = true;
  selectedDocUrl: string = '';
  safeUrl!: SafeResourceUrl;
  isPreviewOpen = false;
  isPdf = false;
allDocuments: any[] = [];
members: any[] = [];
categories: any[] = [];
selectedMember: string = '';
selectedCategory: string = '';
types: any[] = [];
allTypes:any[] = [];   // full list
selectedType: string = '';
searchText: string = '';
isSyncing = false;
syncMessage = '';
isOnlineState = true;
lastSync = '';
private isSyncRunning =
  false;
  constructor(
private offlineVault:
  OfflineVaultService,
    private supabaseService: SupabaseService,
    private sanitizer: DomSanitizer,
    private actionSheetCtrl: ActionSheetController,
      private alertCtrl: AlertController,
    private location: Location,
    private router: Router,
    private syncStatus:
  SyncStatusService,
    private vaultService: VaultService,
    private toastCtrl: ToastController
  ) {}

async ngOnInit() {

  // =====================================
  // SYNC STATUS SUBSCRIPTIONS
  // =====================================

  this.syncStatus
    .isOnline$
    .subscribe(value => {
      console.log("value....", value);

      this.isOnlineState =
        value;
    });

  this.syncStatus
    .isSyncing$
    .subscribe(value => {

      this.isSyncing =
        value;
    });

  this.syncStatus
    .syncMessage$
    .subscribe(value => {

      this.syncMessage =
        value;
    });

  this.syncStatus
    .lastSync$
    .subscribe(value => {

      this.lastSync =
        value;
    });

  console.log(
    '🌐 ONLINE?',
    this.isOnline()
  );

  // =====================================
  // OFFLINE MODE
  // =====================================

  if (!this.isOnline()) {

    console.log(
      '📴 OFFLINE MODE'
    );

    // 📦 members
    this.members =
      await this.offlineVault
        .getMembers();

    // 📦 categories
    this.categories =
      await this.offlineVault
        .getCategories();

    // 📦 types
    this.allTypes =
      await this.offlineVault
        .getTypes();

    this.types =
      this.allTypes;

    // 📄 local docs
    await this.loadOfflineDocuments();

    return;
  }

  // =====================================
  // ONLINE MODE
  // =====================================

  console.log(
    '🌐 ONLINE MODE'
  );
         this.processSyncQueue();

  // 🔄 syncing start
  this.syncStatus
    .setSyncing(
      true,
      'Syncing documents...'
    );

  // =========================
  // TYPES
  // =========================

  const {
    data: typesData
  } =
    await this.supabaseService
      .getAllTypes();

  if (typesData) {

    this.allTypes =
      typesData;

    this.types =
      typesData;

    await this.offlineVault
      .saveTypes(
        typesData
      );
  }

  // =========================
  // MEMBERS
  // =========================

  const {
    data: membersData
  } =
    await this.supabaseService
      .getMembers();

  if (membersData) {

    this.members =
      membersData;

    await this.offlineVault
      .saveMembers(
        membersData
      );
  }

  // =========================
  // CATEGORIES
  // =========================

  const {
    data: categoryData
  } =
    await this.supabaseService
      .getCategories();

  if (categoryData) {

    this.categories =
      categoryData;

    await this.offlineVault
      .saveCategories(
        categoryData
      );
  }

  // =====================================
  // SYNC COMPLETE
  // =====================================

  this.syncStatus
    .setSyncing(false);

  this.syncStatus
    .setLastSyncNow();
  //   window.addEventListener(
  // 'storage',
  // async (event) => {

  //   if (
  //     event.key ===
  //     'documents_updated'
  //   ) {

  //     console.log(
  //       '🔄 Documents refresh trigger'
  //     );

  //     await this.loadOfflineDocuments();
  //   }
  // }
// );
}
// =====================================
// INTERNET CHECK
// =====================================

isOnline(): boolean {

  return navigator.onLine;
}
  // =====================================
// MAIN LOAD
// =====================================

  async ionViewWillEnter() {
    // =========================
  // DOCUMENTS
  // =========================
// this.processSyncQueue();
  // 🔒 vault locked

    // const key =
    //   await this.vaultService
    //     .getVaultKey();

    // if (!key) {

    //   this.router.navigateByUrl(
    //     '/dashboard'
    //   );

    //   return;
    // }
const key =
  this.vaultService
    .currentKey;
  // 🔓 unlocked

  await this.loadDocuments();
}
async loadDocuments() {

  this.isLoading = true;

  // ⚡ instant local docs
  await this.loadOfflineDocuments();

  this.isLoading = false;

  // 🌐 run silently in background
if (navigator.onLine && this.shouldSync()) {

  this.syncOnlineDocuments();
}}

// ✅ LOAD DOCUMENTS
async syncOnlineDocuments() {
// =====================================
// PREVENT MULTIPLE SYNC
// =====================================

if (this.isSyncRunning) {

  console.log(
    '⏳ Sync already running'
  );

  return;
}

this.isSyncRunning = true;
  this.syncStatus
    .setSyncing(
      true,
      'Syncing documents...'
    );

  try {

    console.log(
      '🌐 Loading online docs'
    );

    const { data } =
      await this.supabaseService
        .getDocuments();

    if (!data) {

      throw new Error(
        'No data'
      );
    }

    const key =
      this.vaultService
        .currentKey;

    const totalDocs =
      data.length;

    let processedDocs = 0;

    const result:
      DocumentItem[] = [];

    const offlineDocs:
      any[] = [];

    // =====================================
    // PROCESS DOCUMENTS
    // =====================================

    for (
      const doc of data as DocumentItem[]
    ) {

      try {

        const signedUrl =
          await this.supabaseService
            .getSignedUrl(
              doc.file_url
            );

        if (!signedUrl) {
          continue;
        }

        const res =
          await fetch(
            signedUrl
          );

        const encryptedText =
          await res.text();

        // =====================================
        // FILE NAME
        // =====================================

        const fileName =
          doc.file_url
            .split('/')
            .pop();

        if (!fileName) {
          continue;
        }

        // =====================================
        // CACHE CHECK
        // =====================================

        const alreadyCached =
          await this.offlineVault
            .fileExists(
              fileName
            );

        // =====================================
        // ALREADY CACHED
        // =====================================

        if (alreadyCached) {

          console.log(
            '⚡ Using existing cache',
            fileName
          );

          const thumb =
            await this.offlineVault
              .readThumbnail(
                fileName + '.thumb'
              );

          if (thumb) {

            doc.preview =
              `data:image/jpeg;base64,${thumb}`;
          }

          result.push(doc);

          processedDocs++;

          this.syncStatus
            .setSyncing(
              true,
              `Syncing ${processedDocs}/${totalDocs} documents...`
            );
            const originalName =
  fileName
    .split('_')
    .slice(1)
    .join('_')
    .replace('.enc', '');

          offlineDocs.push({

            ...doc,
original_name:
  originalName,
            local_path:
              `vault/${fileName}`,

            thumbnail_path:
              `thumbnails/${fileName}.thumb`,

            synced: true,

            local_only: false,

            sync_pending: false,

            sync_failed: false
          });

          continue;
        }

        // =====================================
        // SAVE ENCRYPTED FILE
        // =====================================

        const localPath =
          await this.offlineVault
            .saveEncryptedFile(
              fileName,
              encryptedText
            );

        console.log(
          '✅ Cached locally'
        );

        // =====================================
        // DECRYPT
        // =====================================

        const decrypted =
          decryptData(
            encryptedText,
            key
          );

        const safeBuffer =
          new Uint8Array(
            decrypted
          ).buffer;

        const blob =
          new Blob(
            [safeBuffer],
            {
              type:
                doc.file_type ||
                'application/octet-stream'
            }
          );

// =====================================
// TEMP URL
// =====================================

const url =
  URL.createObjectURL(blob);

// =====================================
// USE CACHED THUMB
// =====================================

const thumb =
  await this.offlineVault
    .readThumbnail(
      fileName + '.thumb'
    );

if (thumb) {

  doc.preview =
    `data:image/jpeg;base64,${thumb}`;

} else {

  // fallback only

  doc.preview = url;
}

        // =====================================
        // SAVE THUMBNAIL
        // =====================================

        try {

          const response =
            await fetch(url);

          const blob =
            await response.blob();

          await new Promise<void>((resolve) => {

            const reader =
              new FileReader();

            reader.onloadend =
              async () => {

                try {

                  const base64 =
                    (
                      reader.result as string
                    ).split(',')[1];

                  await this.offlineVault
                    .saveThumbnail(
                      fileName + '.thumb',
                      base64
                    );

                } catch (e) {

                  console.error(
                    '❌ Thumbnail cache error',
                    e
                  );
                }

                resolve();
              };

            reader.readAsDataURL(
              blob
            );
          });

        } catch (e) {

          console.error(
            '❌ Thumbnail cache error',
            e
          );
        }

        // =====================================
        // PDF THUMBNAIL
        // =====================================

        if (
          doc.file_url
            .toLowerCase()
            .includes('.pdf')
        ) {

          this.generatePdfThumbnail(
            url
          )
          .then((thumb) => {

            doc.preview =
              thumb;
          })
          .catch(() => {});
        }

        result.push(doc);

        // =====================================
        // OFFLINE METADATA
        // =====================================

// =====================================
// OFFLINE METADATA
// =====================================

const originalName =
  fileName
    .split('_')
    .slice(1)
    .join('_')
    .replace('.enc', '');

offlineDocs.push({

  ...doc,

  original_name:
    originalName,

  local_path:
    localPath,

  thumbnail_path:
    `thumbnails/${fileName}.thumb`,

  synced: true,

  local_only: false,

  sync_pending: false,

  sync_failed: false
});

      } catch (e) {

        console.error(
          'Preview failed',
          e
        );
      }
    }

    // =====================================
    // UPSERT SERVER DOCS ONLY
    // =====================================

    for (const doc of offlineDocs) {

      const existing =
        await this.offlineVault
          .documents
.where('original_name')
.equals(doc.original_name)
          .first();

if (!existing) {

  // ✅ add new server doc

  await this.offlineVault
    .saveLocalDocument(
      doc
    );

} else if (
  existing.local_only
) {

  // ✅ replace local temp doc
  // with synced server doc

  await this.offlineVault
    .documents
    .update(
      existing.id,
      {

        ...doc,

        synced: true,

        local_only: false,

        sync_pending: false,

        sync_failed: false
      }
    );
}
    }

    // =====================================
    // ALWAYS LOAD FRESH DEXIE STATE
    // =====================================

    const freshDocs =
      await this.offlineVault
        .getDocuments();

// =====================================
// RESTORE THUMBNAILS
// =====================================

for (const doc of freshDocs) {

  try {

    const fileName =
      doc.file_url
        ?.split('/')
        ?.pop();

    if (!fileName) {
      continue;
    }

    const thumb =
      await this.offlineVault
        .readThumbnail(
          fileName + '.thumb'
        );

    if (thumb) {

      doc.preview =
        `data:image/jpeg;base64,${thumb}`;
    }

  } catch (e) {

    console.error(
      '❌ Thumb restore failed',
      e
    );
  }
}

// =====================================
// UPDATE UI
// =====================================

this.documents =
  [...freshDocs];

this.allDocuments =
  [...freshDocs];

  } catch (e) {
this.isSyncRunning = false;
    console.warn(
      '⚠️ Loading offline docs'
    );

    this.documents =
      await this.offlineVault
        .getDocuments();

    this.allDocuments =
      this.documents;
  }

  this.syncStatus
    .setSyncing(false);

  this.syncStatus
    .setLastSyncNow();

  localStorage.setItem(
    'last_sync_time',
    Date.now().toString()
  );
  this.isSyncRunning = false;
}
// async syncOnlineDocuments() {
// this.syncStatus
//   .setSyncing(
//     true,
//     'Syncing documents...'
//   );
//   // this.isLoading = true;

//   try {

//     console.log(
//       '🌐 Loading online docs'
//     );

//     const { data } =
//       await this.supabaseService
//         .getDocuments();

//     if (!data) {
//       throw new Error(
//         'No data'
//       );
//     }

//     // const key =
//     //   await this.vaultService
//     //     .getVaultKey();

//     // if (!key) {

//     //   this.router.navigateByUrl(
//     //     '/dashboard'
//     //   );

//     //   return;
//     // }
//     const key =
//   this.vaultService
//     .currentKey;
// const totalDocs =
//   data.length;

// let processedDocs = 0;
//     const result:
//       DocumentItem[] = [];

// const offlineDocs: any[] = [];

//     for (
//       const doc of data as DocumentItem[]
//     ) {

//       try {

//         const signedUrl =
//           await this.supabaseService
//             .getSignedUrl(
//               doc.file_url
//             );

//         if (!signedUrl) {
//           continue;
//         }

//         const res =
//           await fetch(
//             signedUrl
//           );

//         const encryptedText =
//           await res.text();

//         // =====================================
//         // CACHE ENCRYPTED FILE
//         // =====================================

//         const fileName =
//           doc.file_url
//             .split('/')
//             .pop();
// // =====================================
// // SKIP IF ALREADY CACHED
// // =====================================

// const alreadyCached =
//   await this.offlineVault
//     .fileExists(
//       fileName!
//     );

// if (alreadyCached) {

//   console.log(
//     '⚡ Using existing cache',
//     fileName
//   );

//   // 🔥 load thumbnail instantly
//   const thumb =
//     await this.offlineVault
//       .readThumbnail(
//         fileName + '.thumb'
//       );

//   if (thumb) {

//     doc.preview =
//       `data:image/jpeg;base64,${thumb}`;
//   }

//   result.push(doc);
// processedDocs++;

// this.syncStatus
//   .setSyncing(
//     true,
//     `Syncing ${processedDocs}/${totalDocs} documents...`
//   );
      
//   offlineDocs.push({

//     ...doc,

//     local_path:
//       `vault/${fileName}`,

//     thumbnail_path:
//       `thumbnails/${fileName}.thumb`,

//     synced: true
//   });

//   continue;
// }
//         let localPath:any = '';

//         if (fileName) {

//           localPath =
//             await this.offlineVault
//               .saveEncryptedFile(
//                 fileName,
//                 encryptedText
//               );

//           console.log(
//             '✅ Cached locally'
//           );
//         }

//         // =====================================
//         // DECRYPT FOR PREVIEW
//         // =====================================

//         const decrypted =
//           decryptData(
//             encryptedText,
//             key
//           );

//         const safeBuffer =
//           new Uint8Array(
//             decrypted
//           ).buffer;

//         const isPdf =
//           doc.file_url
//             .toLowerCase()
//             .includes('.pdf');

//         const blob =
//           new Blob(
//             [safeBuffer],
//             {
//               type:
//                 doc.file_type ||
//                 'application/octet-stream'
//             }
//           );

//         const url =
//           URL.createObjectURL(
//             blob
//           );

//         doc.preview = url;
// // =====================================
// // CACHE THUMBNAIL
// // =====================================

// try {

//   const response =
//     await fetch(url);

//   const blob =
//     await response.blob();

// await new Promise<void>((resolve) => {

//   const reader =
//     new FileReader();

//   reader.onloadend =
//     async () => {

//       try {

//         const base64 =
//           (
//             reader.result as string
//           ).split(',')[1];

//         await this.offlineVault
//           .saveThumbnail(
//             fileName + '.thumb',
//             base64
//           );

//       } catch (e) {

//         console.error(
//           '❌ Thumbnail cache error',
//           e
//         );
//       }

//       resolve();
//     };

//   reader.readAsDataURL(
//     blob
//   );
// });

// } catch (e) {

//   console.error(
//     '❌ Thumbnail cache error',
//     e
//   );
// }
//         if (isPdf) {

//           this.generatePdfThumbnail(
//             url
//           )
//           .then((thumb) => {

//             doc.preview =
//               thumb;
//           })
//           .catch(() => {});
//         }
//   result.push(doc);

//         // =====================================
//         // SAVE OFFLINE METADATA
//         // =====================================

//         offlineDocs.push({

//           ...doc,

//           local_path:
//             localPath,
// thumbnail_path:
//   `thumbnails/${fileName}`,
//           synced: true
//         });

//       } catch (e) {

//         console.error(
//           'Preview failed',
//           e
//         );
//       }
//     }

//     // 💾 SAVE TO DEXIE
// // =====================================
// // MERGE EXISTING LOCAL DOCS
// // =====================================

// const existingDocs: any[] =
//   await this.offlineVault
//     .getDocuments();

// // keep local-only docs

// const localOnlyDocs: any[] =
//   existingDocs.filter(
//     d => d.local_only
//   );

// // merge server + local-only

// const mergedDocs = [

//   ...offlineDocs,

//   ...localOnlyDocs.filter(
//     local =>
//       !offlineDocs.some(
//         online =>
//           online.file_url ===
//           local.file_url
//       )
//   )
// ];

// // 💾 save merged docs

// await this.offlineVault
//   .saveDocuments(
//     mergedDocs
//   );

// console.log(
//   '📦 OFFLINE DOCS',
//   offlineDocs
// );

// // 🔥 silently update existing docs

// // =====================================
// // MERGE LOCAL + ONLINE
// // =====================================

// if (result.length > 0) {

//   const existing =
//     [...this.documents];

//   const merged = [

//     ...existing,

//     ...result.filter(
//       online =>
//         !existing.some(
//           local =>
//             local.file_url ===
//             online.file_url
//         )
//     )
//   ];

//   this.documents = merged;

//   this.allDocuments = merged;
// }

//   } catch (e) {

//     console.warn(
//       '⚠️ Loading offline docs'
//     );

//     // =====================================
//     // OFFLINE FALLBACK
//     // =====================================

//     this.documents =
//       await this.offlineVault
//         .getDocuments();

//     this.allDocuments =
//       this.documents;

//     console.log(
//       '✅ Offline docs loaded'
//     );
//   }
// this.syncStatus
//   .setSyncing(false);

// this.syncStatus
//   .setLastSyncNow();
//   localStorage.setItem(
//   'last_sync_time',
//   Date.now().toString()
// );
//   // this.isLoading = false;
// }

// =====================================
// LOAD OFFLINE DOCS
// =====================================

// =====================================
// LOAD OFFLINE DOCS
// =====================================

// async loadOfflineDocuments() {

//   this.isLoading = true;

//   console.log(
//     '📦 Loading local docs'
//   );

//   const offlineDocs =
//     await this.offlineVault
//       .getDocuments();

//   // =====================================
//   // LOAD THUMBNAILS FIRST
//   // =====================================

//   for (const doc of offlineDocs) {

//     try {

//       const fileName =
//         doc.file_url
//           .split('/')
//           .pop();

//       if (!fileName) {
//         continue;
//       }

//       // 🖼 cached thumbnail
//       const thumb =
//         await this.offlineVault
//           .readThumbnail(
//             fileName + '.thumb'
//           );

//       if (thumb) {

//         doc.preview =
//           `data:image/jpeg;base64,${thumb}`;
//       }

//     } catch (e) {

//       console.error(
//         '❌ Thumbnail load failed',
//         e
//       );
//     }
//   }

//   // =====================================
//   // UPDATE UI AFTER PREVIEWS READY
//   // =====================================

//   this.documents =
//     [...offlineDocs];

//   this.allDocuments =
//     [...offlineDocs];

//   this.isLoading = false;

//   console.log(
//     '✅ Local docs loaded'
//   );
// }
async loadOfflineDocuments() {

  this.isLoading = true;

  console.log(
    '📦 Loading local docs'
  );

  const offlineDocs =
    await this.offlineVault
      .getDocuments();
offlineDocs.sort((a, b) => {

  const dateA =
    new Date(a.created_at).getTime();

  const dateB =
    new Date(b.created_at).getTime();

  return dateB - dateA;
});
  // =====================================
  // SHOW UI IMMEDIATELY
  // =====================================

  this.documents =
    [...offlineDocs];

  this.allDocuments =
    [...offlineDocs];

  this.isLoading = false;

  console.log(
    '✅ Local docs loaded'
  );

  // =====================================
  // LOAD THUMBNAILS IN BACKGROUND
  // =====================================

  for (const doc of offlineDocs) {

    try {

      const fileName =
        doc.file_url
          .split('/')
          .pop();

      if (!fileName) {
        continue;
      }

      const thumb =
        await this.offlineVault
          .readThumbnail(
            fileName + '.thumb'
          );

      if (thumb) {

        doc.preview =
          `data:image/jpeg;base64,${thumb}`;

        // 🔥 refresh UI progressively

        this.documents = [
          ...this.documents
        ];
      }

    } catch (e) {

      console.error(
        '❌ Thumbnail load failed',
        e
      );
    }
  }
}

  // ✅ PDF THUMBNAIL
  async generatePdfThumbnail(url: string): Promise<string> {
    const pdf = await pdfjsLib.getDocument(url).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) throw new Error('Canvas error');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await (page as any).render({
      canvasContext: context,
      viewport,
      canvas
    }).promise;

    return canvas.toDataURL();
  }

  // ✅ MENU
async openMenu(doc: DocumentItem) {

  const sheet =
    await this.actionSheetCtrl.create({

      header: 'Options',

      cssClass: 'vault-action-sheet',

      buttons: [

        {
          text: 'View',
          icon: 'eye-outline',
          handler: () => this.viewDoc(doc)
        },

        {
          text: 'Download',
          icon: 'download-outline',
          handler: () => this.downloadDoc(doc)
        },

        {
          text: 'Share',
          icon: 'share-social-outline',
          handler: () => this.shareDoc(doc)
        },

        {
          text: 'Delete',
          role: 'destructive',
          icon: 'trash-outline',
          handler: () => this.confirmDelete(doc)
        },

        {
          text: 'Cancel',
          role: 'cancel',
          icon: 'close-outline'
        }

      ]
    });

  await sheet.present();
}

  // ✅ VIEW
// ✅ VIEW
async viewDoc(doc: any) {

  // 🔐 get vault key

  const key =
  this.vaultService
    .currentKey;
  // const key =
  //   await this.vaultService
  //     .getVaultKey();

  // if (!key) {

  //   this.router.navigateByUrl(
  //     '/dashboard'
  //   );

  //   return;
  // }

  try {

    // =====================================
    // READ LOCAL ENCRYPTED FILE
    // =====================================

    const fileName =
      doc.file_url
        .split('/')
        .pop();

    if (!fileName) {

      alert(
        'Invalid file'
      );

      return;
    }

    // 📦 local encrypted cache
    const encryptedText =
      await this.offlineVault
        .readEncryptedFile(
          fileName
        );

    if (!encryptedText) {

      alert(
        'Offline file missing'
      );

      return;
    }

    console.log(
      '✅ Loaded from local cache'
    );

    // =====================================
    // DECRYPT
    // =====================================

    const decrypted =
      decryptData(
        encryptedText,
        key
      );

    const safeBuffer =
      new Uint8Array(
        decrypted
      ).buffer;

    // =====================================
    // CREATE BLOB
    // =====================================

    const blob =
      new Blob(
        [safeBuffer],
        {
          type:
            doc.file_url
              .toLowerCase()
              .includes('.pdf')

              ? 'application/pdf'

              : 'image/jpeg'
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    // =====================================
    // PREVIEW
    // =====================================

    this.selectedDocUrl =
      url;

    this.isPdf =
      doc.file_url
        .toLowerCase()
        .includes('.pdf');

    if (this.isPdf) {

      this.safeUrl =
        this.sanitizer
          .bypassSecurityTrustResourceUrl(
            url
          );
    }

    this.isPreviewOpen =
      true;

  } catch (e) {

    console.error(
      '❌ VIEW ERROR',
      e
    );

    alert(
      'Unable to open file'
    );
  }
}
  closePreview() {
    this.isPreviewOpen = false;
    if (this.selectedDocUrl) {
  URL.revokeObjectURL(this.selectedDocUrl);
}
  }

  // ✅ DOWNLOAD
// ✅ DOWNLOAD

async downloadDoc(doc: any) {

  console.log(
    '📥 DOWNLOAD START'
  );

  try {

    const blob =
      await this.getDecryptedBlob(
        doc
      );

    if (!blob) {
      return;
    }

    const fileName =
      doc.file_url
        .split('/')
        .pop()
        ?.replace('.enc', '')
      || 'file';

    // 🔽 browser download
    const url =
      URL.createObjectURL(
        blob
      );

    const a =
      document.createElement('a');

    a.href =
      url;

    a.download =
      fileName;

    a.click();

    URL.revokeObjectURL(
      url
    );

    console.log(
      '✅ DOWNLOAD SUCCESS'
    );

  } catch (e) {

    console.error(
      '❌ DOWNLOAD ERROR',
      e
    );
  }
}
  // ✅ SHARE
// ✅ SHARE

async shareDoc(doc: any) {

  console.log(
    '📤 SHARE START'
  );

  try {

    const blob =
      await this.getDecryptedBlob(
        doc
      );

    if (!blob) {
      return;
    }

    const fileName =
      doc.file_url
        .split('/')
        .pop()
        ?.replace('.enc', '')
      || 'file';

    const file =
      new File(
        [blob],
        fileName,
        {
          type: blob.type
        }
      );

    // 🌐 WEB SHARE
    if (
      navigator.canShare &&
      navigator.canShare({
        files: [file]
      })
    ) {

      await navigator.share({

        files: [file],

        title: fileName
      });

      console.log(
        '✅ SHARE SUCCESS'
      );
    }

  } catch (e) {

    console.error(
      '❌ SHARE ERROR',
      e
    );
  }
}
selectMember(member: string) {
  this.selectedMember = member;
  this.applyFilters();
}

selectCategory(category: string) {
  this.selectedCategory = category;

  if (category) {
    this.types = this.allTypes.filter(
      t => t.category_name === category
    );
  } else {
    this.types = this.allTypes;
  }

  this.applyFilters();
}
selectType(type: string) {
  this.selectedType = type;
  this.applyFilters();
}
onSearchChange() {
  const search = this.searchText?.toLowerCase() || '';

  if (!search) {
    this.suggestions = [];
    this.applyFilters();
    return;
  }

  this.suggestions = this.allDocuments
    .map(doc => doc.types?.name)
    .filter(name => name?.toLowerCase().includes(search));

  this.applyFilters();
}
applyFilters() {
  let filtered = this.allDocuments.filter(doc => {

    const matchMember =
      !this.selectedMember ||
      doc.members?.name === this.selectedMember;

    const matchCategory =
      !this.selectedCategory ||
      doc.categories?.name === this.selectedCategory;

    const matchType =
      !this.selectedType ||
      doc.types?.name === this.selectedType;

const matchSearch =
  !this.searchText ||
  doc.types?.name?.toLowerCase().includes(this.searchText.toLowerCase());

    return matchMember && matchCategory && matchType && matchSearch;
  });

  // 🔥 SORT
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
  this.searchText = value;   // updates input
  this.suggestions = [];
  this.applyFilters();
    // optional: remove keyboard focus
  (document.activeElement as HTMLElement)?.blur();
  this.applyFilters();
}

highlight(text: string | undefined): SafeHtml {
  if (!text) return '';

  const search = this.searchText?.trim();

  if (!search) return text;

  const regex = new RegExp(`(${search})`, 'gi');

  const replaced = text.replace(
    regex,
    `<span class="highlight">$1</span>`
  );

  return this.sanitizer.bypassSecurityTrustHtml(replaced);
}
isPdfFile(url: string): boolean {
  return url?.toLowerCase().includes('.pdf');
}
goBack() {
  this.location.back();
}
async confirmDelete(doc: any) {
  const alert = await this.alertCtrl.create({
    header: 'Delete Document',
    message: 'Are you sure you want to delete this file?',
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel'
      },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => this.deleteDocument(doc)
      }
    ]
  });

  await alert.present();
}

async deleteDocument(doc: any) {

  // 🔥 remove from UI instantly
  this.allDocuments = this.allDocuments.filter(d => d.id !== doc.id);
  this.documents = [...this.allDocuments];

  // store temporarily
  this.pendingDelete = doc;

  // show undo toast
  this.showUndoToast();

  // delay actual delete
  this.deleteTimeout = setTimeout(async () => {
    await this.finalDelete(doc);
    this.pendingDelete = null;
  }, 4000); // 4 sec undo window
}

async finalDelete(doc: any) {
  try {
    let path = doc.file_url;

    if (path.includes('http')) {
      path = path.split('/documents/')[1];
    }

    await this.supabaseService.deleteFile(path);
    await this.supabaseService.deleteRecord(doc.id);
    this.showToast();
  } catch (err) {
    console.error('Final delete error', err);
  }
}
async showToast() {
  const toast = await this.toastCtrl.create({
    message: 'Document deleted',
    duration: 2000
  });
  toast.present();
}

undoDelete() {
  if (!this.pendingDelete) return;

  clearTimeout(this.deleteTimeout);

  const restoredDoc = {
    ...this.pendingDelete,
    isRestoring: true
  };

  // add back to UI
  this.allDocuments.unshift(restoredDoc);
  this.documents = [...this.allDocuments];

  // remove animation flag after animation
  setTimeout(() => {
    restoredDoc.isRestoring = false;
  }, 400);

  this.pendingDelete = null;
}

async showUndoToast() {
  const toast = await this.toastCtrl.create({
    message: 'Document deleted',
    duration: 4000,
    buttons: [
      {
        text: 'Undo',
        handler: () => this.undoDelete()
      }
    ]
  });

  await toast.present();
}

async cacheDocumentsLocally(
  docs: any[]
) {

  const cachedDocs = [];

  for (const doc of docs) {

    try {

      console.log(
        '📥 Caching',
        doc.file_url
      );

      // 🔗 signed url
      const signedUrl =
        await this.supabaseService
          .getSignedUrl(
            doc.file_url
          );

      if (!signedUrl) {
        continue;
      }

      // 📦 download encrypted
      const res =
        await fetch(signedUrl);

      const encryptedText =
        await res.text();

      // 📄 filename
      const fileName =
        doc.file_url
          .split('/')
          .pop();

      // 💾 save local file
      const localPath =
        await this.offlineVault
          .saveEncryptedFile(
            fileName,
            encryptedText
          );

      // 📦 store metadata
      cachedDocs.push({

        ...doc,

        local_path:
          localPath,

        synced: true
      });

    } catch (e) {

      console.error(
        '❌ Cache error',
        e
      );
    }
  }

  // 💾 save metadata in Dexie
  await this.offlineVault
    .saveDocuments(
      cachedDocs
    );

  console.log(
    '✅ All docs cached offline'
  );
}
// =====================================
// GET DECRYPTED BLOB
// =====================================

async getDecryptedBlob(
  doc: any
): Promise<Blob | null> {

  try {

    // 🔐 key
    const key =
  this.vaultService
    .currentKey;
    // const key =
    //   await this.vaultService
    //     .getVaultKey();

    // if (!key) {
    //   return null;
    // }

    // 📄 filename
    const fileName =
      doc.file_url
        .split('/')
        .pop();

    if (!fileName) {
      return null;
    }

    // 📦 local encrypted file
    const encryptedText =
      await this.offlineVault
        .readEncryptedFile(
          fileName
        );

    if (!encryptedText) {

      alert(
        'Offline file missing'
      );

      return null;
    }

    // 🔓 decrypt
    const decrypted =
      decryptData(
        encryptedText,
        key
      );

    const safeBuffer =
      new Uint8Array(
        decrypted
      ).buffer;

    // 📦 blob
    return new Blob(
      [safeBuffer],
      {
        type:
          doc.file_type ||
          'application/octet-stream'
      }
    );

  } catch (e) {

    console.error(
      '❌ Blob creation failed',
      e
    );

    return null;
  }
}

shouldSync(): boolean {

  // 🔥 upload triggered sync

  const forceSync =
    localStorage.getItem(
      'force_sync'
    );

  if (forceSync === 'true') {

    localStorage.removeItem(
      'force_sync'
    );

    return true;
  }

  // 🕒 normal timed sync

  const last =
    localStorage.getItem(
      'last_sync_time'
    );

  if (!last) {
    return true;
  }

  const diff =
    Date.now() - Number(last);

  // 5 minutes

  return diff > 5 * 60 * 1000;
}

// =====================================
// PROCESS SYNC QUEUE
// =====================================

async processSyncQueue() {

  console.log(
    '🔄 processSyncQueue'
  );

  // =====================================
  // INTERNET CHECK
  // =====================================

  if (!navigator.onLine) {

    console.log(
      '📴 Offline - sync skipped'
    );

    return;
  }

  // =====================================
  // GET PENDING JOBS
  // =====================================

  const jobs =
    await this.offlineVault
      .syncQueue
      .where('status')
      .equals('pending')
      .toArray();

  console.log(
    '📦 Pending jobs',
    jobs.length
  );

  // =====================================
  // LOOP JOBS
  // =====================================

  for (const job of jobs) {

    try {

      // =====================================
      // UPLOAD JOB
      // =====================================

      if (job.type !== 'upload') {
        continue;
      }

      // =====================================
      // GET LOCAL DOCUMENT
      // =====================================

      const doc =
        await this.offlineVault
          .documents
          .get(
            job.document_id
          );

      if (!doc) {

        console.warn(
          '⚠️ Local doc missing'
        );

        continue;
      }

      console.log(
        '☁️ Uploading queued doc',
        doc.original_name
      );

      // =====================================
      // READ ENCRYPTED LOCAL FILE
      // =====================================

      const encryptedText =
        await this.offlineVault
          .readEncryptedFile(
            doc.file_url
          );

      if (!encryptedText) {

        console.error(
          '❌ Local encrypted file missing'
        );

        continue;
      }

      // =====================================
      // CREATE ENCRYPTED FILE
      // =====================================

      const encryptedFile =
        new File(

          [encryptedText],

          doc.original_name + '.enc',

          {
            type: 'text/plain'
          }
        );

      // =====================================
      // UPLOAD TO SUPABASE STORAGE
      // =====================================

      const filePath =
        await this.supabaseService
          .uploadFile(
            encryptedFile
          );

      console.log(
        '✅ File uploaded',
        filePath
      );

      // =====================================
      // SAVE RECORD TO DB
      // =====================================

      const {
        data,
        error
      } =
        await this.supabaseService
          .saveRecord({

            member_id:
              doc.member_id,

            category_id:
              doc.category_id,

            type_id:
              doc.type_id,

            file_url:
              filePath,

            file_type:
              doc.file_type,

            created_at:
              new Date()
                .toISOString()
          });

      if (error) {

        console.error(
          '❌ saveRecord failed',
          error
        );

        continue;
      }

      console.log(
        '✅ Record saved'
      );

      // =====================================
      // UPDATE LOCAL DOC
      // =====================================

      await this.offlineVault
        .documents
        .update(

          job.document_id,

          {
server_id:
  (data as any)?.id || null,

            synced: true,

            sync_pending: false,

            sync_failed: false,

            local_only: false
          }
        );

      console.log(
        '✅ Local doc updated'
      );

      // =====================================
      // COMPLETE QUEUE JOB
      // =====================================

      await this.offlineVault
        .syncQueue
        .update(

          job.id,

          {
            status: 'completed'
          }
        );

      console.log(
        '✅ Queue completed'
      );

    } catch (e) {

      console.error(
        '❌ Queue upload failed',
        e
      );
    }
  }

  // =====================================
  // REFRESH DOCUMENTS
  // =====================================

  await this.loadOfflineDocuments();

  console.log(
    '🎉 Queue sync finished'
  );
}
// =====================================
// PULL TO REFRESH
// =====================================

async doRefresh(
  event: any
) {

  console.log(
    '🔄 Pull refresh'
  );

  try {

    // =====================================
    // PROCESS PENDING QUEUE
    // =====================================

    await this.processSyncQueue();

    // =====================================
    // REFRESH SERVER DOCS
    // =====================================

    if (navigator.onLine) {

      await this.syncOnlineDocuments();

    } else {

      await this.loadOfflineDocuments();
    }

  } catch (e) {

    console.error(
      '❌ Refresh failed',
      e
    );

  } finally {

    // =====================================
    // STOP REFRESH UI
    // =====================================

    event.target.complete();
  }
}
}