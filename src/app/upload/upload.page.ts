import { Component, OnDestroy } from '@angular/core';
import { IonicModule, ActionSheetController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { VaultService } from '../services/vault.service';
import { encryptData } from 'src/app/utils/encryption.util';
import {
  DomSanitizer
} from '@angular/platform-browser';
import { OfflineVaultService } from '../services/offline-vault.service';
import * as pdfjsLib from 'pdfjs-dist';
(pdfjsLib as any)
  .GlobalWorkerOptions
  .workerSrc =
    'assets/pdf.worker.min.js';
@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './upload.page.html',
  styleUrls: ['./upload.page.scss'],
})
export class UploadPage  implements OnDestroy {

  // 🔹 DB driven dropdowns
  members: any[] = [];
  categories: any[] = [];
  types: any[] = [];
isUploading = false;
selectedFilesPreview: any[] = [];
uploadProgress = 0;
selectedDocUrl = '';

isPdf = false;

safeUrl: any;

isPreviewOpen = false;
uploadMessage = '';
  selectedMemberId: string = '';
  selectedCategoryId: string = '';
  selectedTypeId: string = '';

  // 📁 Files
  files: File[] = [];
  selectedFileNames: string[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private actionSheetCtrl: ActionSheetController,
    private router: Router,
    private location: Location,
    private vaultService: VaultService,
    private sanitizer: DomSanitizer,
      private offlineVault:
    OfflineVaultService

  ) {
      console.log(
    '✅ Dexie service working'
  );
  }

  // 🚀 Load initial data
  async ngOnInit() {
    await this.loadMembers();
    await this.loadCategories();
  }

async loadMembers() {

  // ─────────────────────────────
  // LOAD LOCAL FIRST
  // ─────────────────────────────

  const localMembers =
    await this.offlineVault
      .getMembers();

  // ✅ USE CACHE
  if (localMembers.length) {

    console.log(
      '⚡ Using cached members'
    );

    this.members =
      localMembers;

    return;
  }

  // ─────────────────────────────
  // FETCH ONLINE ONLY IF EMPTY
  // ─────────────────────────────

  try {

    console.log(
      '🌐 Fetching members online'
    );

    const {
      data,
      error
    } =
      await this.supabaseService
        .getMembers();

    if (error) {
      throw error;
    }

    this.members =
      data || [];

    // 💾 CACHE
    await this.offlineVault
      .saveMembers(
        this.members
      );

    console.log(
      '✅ Members cached'
    );

  } catch (e) {

    console.error(
      '❌ Members load failed',
      e
    );
  }
}

async loadCategories() {

  // ─────────────────────────────
  // LOAD LOCAL FIRST
  // ─────────────────────────────

  const localCategories =
    await this.offlineVault
      .getCategories();

  // ✅ USE CACHE
  if (localCategories.length) {

    console.log(
      '⚡ Using cached categories'
    );

    this.categories =
      localCategories;

    return;
  }

  // ─────────────────────────────
  // FETCH ONLINE ONLY IF EMPTY
  // ─────────────────────────────

  try {

    console.log(
      '🌐 Fetching categories online'
    );

    const {
      data,
      error
    } =
      await this.supabaseService
        .getCategories();

    if (error) {
      throw error;
    }

    this.categories =
      data || [];

    // 💾 CACHE
    await this.offlineVault
      .saveCategories(
        this.categories
      );

    console.log(
      '✅ Categories cached'
    );

  } catch (e) {

    console.error(
      '❌ Categories load failed',
      e
    );
  }
}

async loadTypes() {

  // ─────────────────────────────
  // LOAD LOCAL FIRST
  // ─────────────────────────────

  const localTypes =
    await this.offlineVault
      .getTypes();

  // ✅ USE CACHE
  if (localTypes.length) {

    console.log(
      '⚡ Using cached types'
    );

    this.types =
      localTypes;

    return;
  }

  // ─────────────────────────────
  // FETCH ONLINE ONLY IF EMPTY
  // ─────────────────────────────

  try {

    console.log(
      '🌐 Fetching types online'
    );

    const {
      data,
      error
    } =
      await this.supabaseService
        .getAllTypes();

    if (error) {
      throw error;
    }

    this.types =
      data || [];

    // 💾 CACHE
    await this.offlineVault
      .saveTypes(
        this.types
      );

    console.log(
      '✅ Types cached'
    );

  } catch (e) {

    console.error(
      '❌ Types load failed',
      e
    );
  }
}
  onCategoryChange() {
    this.selectedTypeId = '';
    this.loadTypes();
  }

  // 📸 Select file options
async openOptions(fileInput: any) {

  const sheet =
    await this.actionSheetCtrl.create({

      header: 'Upload Document',

      cssClass: 'vault-action-sheet',

      buttons: [

        {
          text: 'Camera',
          icon: 'camera-outline',

          handler: () =>
            this.captureFromCamera()
        },

        {
          text: 'Gallery',
          icon: 'images-outline',

          handler: () =>
            fileInput.click()
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
  // 📷 Camera
  async captureFromCamera() {
    const image = await Camera.getPhoto({
      quality: 80,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
    });

    const file = await this.convertToFile(image.webPath!);

    if (file) {
      this.files.push(file);
      this.selectedFileNames.push(file.name);
    }
  }

  // 📁 Multi file select
onFilesSelected(event: any) {

  const files:any =
    Array.from(event.target.files)
  for (const file of files) {

    this.files.push(file);

    this.selectedFileNames.push(file.name);

    // 🔥 preview object
    this.selectedFilesPreview.push({

      name: file.name,

      type: file.type,

      url: URL.createObjectURL(file)
    });
  }
}

openLocalPreview(file: any) {

  this.selectedDocUrl = file.url;

  this.isPdf =
    file.type.includes('pdf');

  if (this.isPdf) {

    this.safeUrl =
      this.sanitizer
        .bypassSecurityTrustResourceUrl(
          file.url
        );
  }

  this.isPreviewOpen = true;
}

  // 🔄 Convert
  async convertToFile(path: string): Promise<File> {
    const response = await fetch(path);
    const blob = await response.blob();

    return new File([blob], `doc_${Date.now()}.jpg`, {
      type: blob.type,
    });
  }
async generatePdfThumbnail(
  url: string
): Promise<string> {

  const pdf =
    await pdfjsLib
      .getDocument(url)
      .promise;

  const page =
    await pdf.getPage(1);

  const viewport =
    page.getViewport({
      scale: 1
    });

  const canvas =
    document.createElement(
      'canvas'
    );

  const context =
    canvas.getContext('2d');

  if (!context) {

    throw new Error(
      'Canvas unavailable'
    );
  }

  canvas.width =
    viewport.width;

  canvas.height =
    viewport.height;

  await (
    page as any
  ).render({

    canvasContext:
      context,

    viewport,

    canvas
  }).promise;

  return canvas.toDataURL(
    'image/jpeg',
    0.7
  );
}
// 📤 Upload
async upload() {

  // ❌ validation
  if (this.files.length === 0) {

    alert('Please select files');
    return;
  }

  if (
    !this.selectedMemberId ||
    !this.selectedCategoryId
  ) {

    alert('Please fill all fields');
    return;
  }

  // 🔄 START UI
  this.isUploading = true;

  this.uploadProgress = 0;

  this.uploadMessage =
    'Preparing secure upload...';

  try {

    // 🔐 get vault key
    const key =
      await this.vaultService.getVaultKey();

    if (!key) {

      this.isUploading = false;
      return;
    }

    // 📂 TOTAL FILES
    const totalFiles =
      this.files.length;

    // 🔁 LOOP FILES
    for (let i = 0; i < totalFiles; i++) {

      const file =
        this.files[i];

      try {

        // 🔢 progress calculation
        const startProgress =
          Math.round((i / totalFiles) * 100);

        const endProgress =
          Math.round(((i + 1) / totalFiles) * 100);

        // 🔐 ENCRYPT
        this.uploadMessage =
          `Encrypting ${file.name}`;

        this.uploadProgress =
          startProgress + 10;

        const buffer =
          await file.arrayBuffer();

        const encrypted =
          encryptData(buffer, key);
// =====================================
// SAVE ENCRYPTED FILE LOCALLY
// =====================================

const localFileName =
  `${Date.now()}_${file.name}.enc`;

const localPath =
  await this.offlineVault
    .saveEncryptedFile(
      localFileName,
      encrypted
    );

// =====================================
// LOCAL DOCUMENT OBJECT
// =====================================

const localDoc = {

  server_id: null,

  member_id:
    this.selectedMemberId,

  category_id:
    this.selectedCategoryId,

  type_id:
    this.selectedTypeId,
local_file_name: localFileName,
  file_url:
    localFileName,
original_name:
  file.name,
  file_type:
    file.type,
thumbnail_path:
  `thumbnails/${localFileName}.thumb`,
created_at:
  new Date().toISOString(),

  local_path:
    localPath,

  synced: false,

  sync_pending: true,

  sync_failed: false,
members:
  this.members.find(
    m => m.id === this.selectedMemberId
  ),

categories:
  this.categories.find(
    c => c.id === this.selectedCategoryId
  ),

types:
  this.types.find(
    t => t.id === this.selectedTypeId
  ),
  local_only: true
};

// =====================================
// SAVE LOCAL DOC
// =====================================

const localId =
  await this.offlineVault
    .saveLocalDocument(
      localDoc
    );

await this.offlineVault
  .addToSyncQueue({

    type: 'upload',

    document_id:
      localId
  });
  // =====================================
// LOCAL THUMBNAIL
// =====================================

// =====================================
// LOCAL THUMBNAIL
// =====================================

try {

  // ─────────────────────────────
  // IMAGE
  // ─────────────────────────────

  if (
    file.type.startsWith(
      'image/'
    )
  ) {

    const reader =
      new FileReader();

    await new Promise<void>(
      (resolve) => {

        reader.onloadend =
          async () => {

            try {

              const base64 = (
                reader.result as string
              ).split(',')[1];

              await this.offlineVault
                .saveThumbnail(
                  localFileName + '.thumb',
                  base64
                );

              console.log(
                '🖼 Image thumbnail saved'
              );

            } catch (e) {

              console.error(
                '❌ Image thumbnail failed',
                e
              );
            }

            resolve();
          };

        reader.readAsDataURL(
          file
        );
      }
    );
  }

  // ─────────────────────────────
  // PDF
  // ─────────────────────────────

  else if (
    file.type ===
    'application/pdf'
  ) {

    const pdfUrl =
      URL.createObjectURL(
        file
      );

    try {

      const thumb =
        await this.generatePdfThumbnail(
          pdfUrl
        );

      const base64 =
        thumb.split(',')[1];

      await this.offlineVault
        .saveThumbnail(
          localFileName + '.thumb',
          base64
        );

      console.log(
        '📄 PDF thumbnail saved'
      );

    } finally {

      URL.revokeObjectURL(
        pdfUrl
      );
    }
  }

} catch (e) {

  console.error(
    '❌ Local thumbnail failed',
    e
  );
}
// 🔥 allow Dexie/UI flush
localStorage.setItem(
  'documents_updated',
  Date.now().toString()
);
await new Promise(
  resolve =>
    setTimeout(resolve, 150)
);
console.log(
  '💾 Local document saved'
);
// =====================================
// OFFLINE ONLY
// =====================================

if (!navigator.onLine) {

  console.log(
    '📴 Saved for background sync'
  );

  continue;
}
        // 📦 create encrypted file
//         const encryptedFile =
//           new File(
//             [encrypted],
//             file.name + '.enc',
//             {
//               type: 'text/plain'
//             }
//           );

//         // 📤 UPLOAD
//         this.uploadMessage =
//           `Uploading ${file.name}`;

//         this.uploadProgress =
//           startProgress + 45;

//         const filePath =
//           await this.supabaseService
//             .uploadFile(encryptedFile);

//         // 💾 SAVE METADATA
//         this.uploadMessage =
//           `Saving ${file.name}`;

//         this.uploadProgress =
//           startProgress + 75;

//         await this.supabaseService
//           .saveRecord({

//             member_id:
//               this.selectedMemberId,

//             category_id:
//               this.selectedCategoryId,

//             type_id:
//               this.selectedTypeId,

//             file_url:
//               filePath,

//             file_type:
//               file.type,

// created_at:
//   new Date().toISOString()
//           });

        // ✅ file completed
        this.uploadProgress =
          endProgress;

      } catch (e) {

        console.error(
          'Upload failed',
          file.name,
          e
        );
      }
    }

    // ✅ FINISH
    this.uploadProgress = 100;

    this.uploadMessage =
      'Upload complete';

    // ✨ small delay
    setTimeout(() => {

      this.isUploading = false;

      this.files = [];

      this.selectedFileNames = [];

      this.router.navigateByUrl(
        '/dashboard'
      );
localStorage.setItem(
  'force_sync',
  'true'
);
    }, 800);

  } catch (e) {

    console.error(e);

    this.isUploading = false;

    alert('Upload failed');
  }
}
  goBack() {
  this.location.back();
}

removeFile(index: number) {
const preview =
  this.selectedFilesPreview[index];

if (preview?.url) {

  URL.revokeObjectURL(
    preview.url
  );
}
  this.files.splice(index, 1);

  this.selectedFileNames.splice(index, 1);

  this.selectedFilesPreview.splice(index, 1);
}

// ─────────────────────────────────────
// CLEANUP OBJECT URLS
// ─────────────────────────────────────

ngOnDestroy() {

  for (const file of this.selectedFilesPreview) {

    try {

      if (file.url) {

        URL.revokeObjectURL(
          file.url
        );
      }

    } catch (e) {

      console.warn(
        '⚠️ URL cleanup failed',
        e
      );
    }
  }
}
}