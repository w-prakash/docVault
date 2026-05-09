import { Component } from '@angular/core';
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
@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './upload.page.html',
  styleUrls: ['./upload.page.scss'],
})
export class UploadPage {

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
    private sanitizer: DomSanitizer

  ) {}

  // 🚀 Load initial data
  async ngOnInit() {
    await this.loadMembers();
    await this.loadCategories();
  }

  async loadMembers() {
    const { data } = await this.supabaseService.getMembers();

    if (data) {
      this.members = data;
      this.selectedMemberId = data[0]?.id;
    }
  }

  async loadCategories() {
    const { data } = await this.supabaseService.getCategories();

    if (data) {
      this.categories = data;
      this.selectedCategoryId = data[0]?.id;
      await this.loadTypes();
    }
  }

  async loadTypes() {
    if (!this.selectedCategoryId) return;

    const { data } = await this.supabaseService.getTypes(this.selectedCategoryId);

    if (data) {
      this.types = data;
      this.selectedTypeId = data[0]?.id;
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

        // 📦 create encrypted file
        const encryptedFile =
          new File(
            [encrypted],
            file.name + '.enc',
            {
              type: 'text/plain'
            }
          );

        // 📤 UPLOAD
        this.uploadMessage =
          `Uploading ${file.name}`;

        this.uploadProgress =
          startProgress + 45;

        const filePath =
          await this.supabaseService
            .uploadFile(encryptedFile);

        // 💾 SAVE METADATA
        this.uploadMessage =
          `Saving ${file.name}`;

        this.uploadProgress =
          startProgress + 75;

        await this.supabaseService
          .saveRecord({

            member_id:
              this.selectedMemberId,

            category_id:
              this.selectedCategoryId,

            type_id:
              this.selectedTypeId,

            file_url:
              filePath,

            file_type:
              file.type,

            created_at:
              new Date(),
          });

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

  this.files.splice(index, 1);

  this.selectedFileNames.splice(index, 1);

  this.selectedFilesPreview.splice(index, 1);
}
}