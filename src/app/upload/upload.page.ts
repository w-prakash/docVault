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
    private vaultService: VaultService
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
    const sheet = await this.actionSheetCtrl.create({
      header: 'Upload Document',
      buttons: [
        {
          text: 'Camera',
          handler: () => this.captureFromCamera()
        },
        {
          text: 'Gallery',
          handler: () => fileInput.click()
        },
        {
          text: 'Cancel',
          role: 'cancel'
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
    const selectedFiles = event.target.files;

    for (let i = 0; i < selectedFiles.length; i++) {
      this.files.push(selectedFiles[i]);
      this.selectedFileNames.push(selectedFiles[i].name);
    }
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

  if (this.files.length === 0) {
    alert('Please select files');
    return;
  }

  if (!this.selectedMemberId || !this.selectedCategoryId) {
    alert('Please fill all fields');
    return;
  }

  // 🔐 get derived key (already derived)
  const key = await this.vaultService.getVaultKey();
  if (!key) return;

  for (const file of this.files) {

    try {
      // 🔐 Encrypt file
const buffer = await file.arrayBuffer();
const encrypted = encryptData(buffer, key);

const encryptedFile = new File(
  [encrypted],
  file.name + '.enc',
  { type: 'text/plain' }
);
      const filePath = await this.supabaseService.uploadFile(encryptedFile);

      await this.supabaseService.saveRecord({
        member_id: this.selectedMemberId,
        category_id: this.selectedCategoryId,
        type_id: this.selectedTypeId,
        file_url: filePath,
        file_type: file.type,
        created_at: new Date(),
      });

    } catch (e) {
      console.error('Upload failed', e);
    }
  }

  alert('Encrypted upload complete ✔');
  this.router.navigateByUrl('/dashboard');

  this.files = [];
  this.selectedFileNames = [];
}
  goBack() {
  this.location.back();
}
}