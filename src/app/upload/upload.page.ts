import { Component, OnDestroy } from '@angular/core';
import { IonicModule, ActionSheetController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { VaultService } from '../services/vault.service';
import { encryptData } from 'src/app/utils/encryption.util';
import { isSupportedDocumentType, unsupportedFileTypeMessage } from 'src/app/utils/file-type.util';
import { GoogleDriveService } from 'src/app/core/google/drive/google-drive.service';
import { DocVaultFolderService } from 'src/app/core/google/drive/docvault-folder.service';
import { DriveOfflineError } from 'src/app/core/google/drive/google-drive.models';
import { ReferenceDataService } from '../services/reference-data.service';
import {
  DomSanitizer
} from '@angular/platform-browser';
import { OfflineVaultService } from '../services/offline-vault.service';
import { NotificationService } from '../services/notification.service';
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
    private actionSheetCtrl: ActionSheetController,
    private router: Router,
    private location: Location,
    private vaultService: VaultService,
    private sanitizer: DomSanitizer,
      private offlineVault:
    OfflineVaultService,
    private driveService: GoogleDriveService,
    private folderService: DocVaultFolderService,
    private referenceDataService: ReferenceDataService,
    private notificationService: NotificationService

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

  const localMembers =
    await this.offlineVault
      .getMembers();

  if (localMembers.length) {

    console.log(
      '⚡ Using cached members'
    );

    this.members =
      localMembers;

    return;
  }

  // no members yet on this device — seed a default one so upload isn't blocked
  console.log('🌱 No members found — seeding default');

  try {

    await this.referenceDataService.ensureDefaultMember();

    this.members = await this.offlineVault.getMembers();

  } catch (e) {

    console.error('❌ Failed to seed default member', e);
  }
}

async loadCategories() {

  const localCategories =
    await this.offlineVault
      .getCategories();

  if (localCategories.length) {

    console.log(
      '⚡ Using cached categories'
    );

    this.categories =
      localCategories;

    return;
  }

  console.log('🌱 No categories found — seeding defaults');

  try {

    await this.referenceDataService.ensureDefaultCategories();

    this.categories = await this.offlineVault.getCategories();

  } catch (e) {

    console.error('❌ Failed to seed default categories', e);
  }
}

async loadTypes() {

  const localTypes =
    await this.offlineVault
      .getTypes();

  if (localTypes.length) {

    console.log(
      '⚡ Using cached types'
    );

    this.types =
      localTypes;

    return;
  }

  // categories + types are seeded together
  try {

    await this.referenceDataService.ensureDefaultCategories();

    this.types = await this.offlineVault.getTypes();

  } catch (e) {

    console.error('❌ Failed to seed default types', e);
  }
}
  onCategoryChange() {
    this.selectedTypeId = '';
    this.loadTypes();
  }

  async addMemberPrompt() {

    const name = window.prompt('Member name (e.g. "Mom", "Dad", "Myself")');

    if (!name || !name.trim()) {
      return;
    }

    try {

      const member = await this.referenceDataService.addMember(name);

      this.members = [...this.members, member];

      this.selectedMemberId = member.id;

    } catch (e) {

      console.error('❌ Failed to add member', e);
      alert('Could not add member. Please try again.');

    }
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

    if (!isSupportedDocumentType(file)) {
      alert(unsupportedFileTypeMessage(file));
      continue;
    }

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

      let syncJobId: number | undefined;

      try {

        // 🔢 progress calculation
        // Each file owns an equal slice of the 0-100 bar (100 / totalFiles wide).
        // fileFraction (0..1) tracks how far through THIS file's work we are;
        // setProgress() scales it into that file's slice and clamps to 100,
        // so it can never overshoot regardless of how many files there are.
        const setProgress = (fileFraction: number) => {
          const raw = ((i + fileFraction) / totalFiles) * 100;
          this.uploadProgress = Math.min(100, Math.max(0, Math.round(raw)));
        };

        // 🔐 ENCRYPT
        this.uploadMessage =
          `Encrypting ${file.name}`;

        setProgress(0.10);

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

syncJobId =
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
        // =====================================
        // UPLOAD TO GOOGLE DRIVE (DocVault folder)
        // =====================================

        this.uploadMessage =
          `Uploading ${file.name}`;

        this.notificationService.driveUploadStarted(file.name);

        setProgress(0.45);

        const folderId =
          await this.folderService.getFolderId();

        const encryptedBlob =
          new Blob([encrypted], { type: 'application/octet-stream' });

        const driveFile =
          await this.driveService.uploadMultipart(
            encryptedBlob,
            {
              name: `${file.name}.enc`,
              mimeType: 'application/octet-stream',
              parents: [folderId],
              appProperties: {
                member_id: this.selectedMemberId,
                category_id: this.selectedCategoryId,
                type_id: this.selectedTypeId ?? '',
                original_name: file.name,
                file_type: file.type
              }
            },
            (percent) => {
              setProgress(0.45 + Math.min(100, Math.max(0, percent)) / 100 * 0.40);
            }
          );

        // 💾 UPDATE LOCAL DOCUMENT WITH DRIVE FILE ID
        this.uploadMessage =
          `Saving ${file.name}`;

        setProgress(0.90);

        await this.offlineVault
          .saveLocalDocument({
            ...localDoc,
            id: localId,
            server_id: driveFile.id,
            synced: true,
            sync_pending: false,
            sync_failed: false,
            local_only: false
          });

        await this.offlineVault
          .markSyncJobDone(syncJobId);

        this.notificationService.driveUploadCompleted(file.name);

        // ✅ file completed
        setProgress(1);

      } catch (e) {

        console.error(
          'Upload failed',
          file.name,
          e
        );

        // 🔁 leave it queued for background sync (Phase 8) instead of losing it
        try {

          if (e instanceof DriveOfflineError) {
            console.log('📴 Went offline mid-upload — left queued for background sync');
          } else if (syncJobId !== undefined) {
            await this.offlineVault.markSyncJobFailed(syncJobId);
            await this.notificationService.driveUploadFailed(file.name);
          }

        } catch (queueError) {
          console.error('❌ Failed to update sync queue after upload failure', queueError);
        }
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