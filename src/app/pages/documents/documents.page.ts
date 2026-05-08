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
  constructor(

    private supabaseService: SupabaseService,
    private sanitizer: DomSanitizer,
    private actionSheetCtrl: ActionSheetController,
      private alertCtrl: AlertController,
    private location: Location,
    private vaultService: VaultService,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
  // load members
const { data: typesData } = await this.supabaseService.getAllTypes();

if (typesData) {
  this.allTypes = typesData;   // 🔒 store full list
  this.types = typesData;      // 🎯 show in UI
}
  const { data: membersData } = await this.supabaseService.getMembers();
  if (membersData) {
    this.members = membersData;
  }

  // load categories
  const { data: categoryData } = await this.supabaseService.getCategories();
  if (categoryData) {
    this.categories = categoryData;
  }

  // load documents
  await this.loadDocuments();
  }

  // ✅ LOAD DOCUMENTS
async loadDocuments() {

  this.isLoading = true;

  const { data } = await this.supabaseService.getDocuments();
  if (!data) return;

  const key = await this.vaultService.getVaultKey();
  if (!key) return;

  const result: DocumentItem[] = [];

  for (const doc of data as DocumentItem[]) {

    try {
      const signedUrl = await this.supabaseService.getSignedUrl(doc.file_url);
      if (!signedUrl) continue;

      const res = await fetch(signedUrl);
      const encryptedText = await res.text();

      const decrypted = decryptData(encryptedText, key);
      const safeBuffer = new Uint8Array(decrypted).buffer;

      const isPdf = doc.file_url.toLowerCase().includes('.pdf');

      const blob = new Blob([safeBuffer], {
      type: doc.file_type || 'application/octet-stream'
      });

      const url = URL.createObjectURL(blob);

      // 🔥 Default preview
      doc.preview = url;

      // 🔥 PDF thumbnail (async, optional)
      if (isPdf) {
        this.generatePdfThumbnail(url)
          .then((thumb) => doc.preview = thumb)
          .catch(() => {});
      }

      result.push(doc);

    } catch (e) {
      console.error('Preview failed', e);
    }
  }

  this.documents = result;
  this.allDocuments = result;

  this.isLoading = false;
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
    const sheet = await this.actionSheetCtrl.create({
      header: 'Options',
      buttons: [
        { text: 'View', handler: () => this.viewDoc(doc) },
        { text: 'Download', handler: () => this.downloadDoc(doc) },
        { text: 'Share', handler: () => this.shareDoc(doc) },
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => this.confirmDelete(doc) }
      ]
    });

    await sheet.present();
  }

  // ✅ VIEW
async viewDoc(doc: any) {

  const key = await this.vaultService.getVaultKey();
  if (!key) return;

  const signedUrl = await this.supabaseService.getSignedUrl(doc.file_url);
  if (!signedUrl) return;

  try {
    const res = await fetch(signedUrl);
    const encryptedText = await res.text();

const decrypted = decryptData(encryptedText, key);

const safeBuffer = new Uint8Array(decrypted).buffer;

const blob = new Blob([safeBuffer], {
  type: doc.file_url.toLowerCase().includes('.pdf')
    ? 'application/pdf'
    : 'image/jpeg'
});


const url = URL.createObjectURL(blob);

    this.selectedDocUrl = url;

    this.isPdf = doc.file_url.toLowerCase().includes('.pdf');

    if (this.isPdf) {
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }

    this.isPreviewOpen = true;

  } catch (e) {
    console.error(e);
    alert('Invalid password');
    this.vaultService.clearKey(); // 🔥 reset wrong key
  }
}

  closePreview() {
    this.isPreviewOpen = false;
    if (this.selectedDocUrl) {
  URL.revokeObjectURL(this.selectedDocUrl);
}
  }

  // ✅ DOWNLOAD
async downloadDoc(doc: any) {

  const key = await this.vaultService.getVaultKey();
  if (!key) return;

  const signedUrl = await this.supabaseService.getSignedUrl(doc.file_url);
  if (!signedUrl) return;

  try {
    const res = await fetch(signedUrl);
    const encryptedText = await res.text();

    const decrypted = decryptData(encryptedText, key);

    const safeBuffer = new Uint8Array(decrypted).buffer;

    const blob = new Blob([safeBuffer], {
      type: doc.file_url.toLowerCase().includes('.pdf')
        ? 'application/pdf'
        : 'image/jpeg'
    });

    const fileName =
      doc.file_url.split('/').pop()?.replace('.enc', '') || 'file';

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();

  } catch (e) {
    console.error(e);
    alert('Invalid password');
    this.vaultService.clearKey();
  }
}
  // ✅ SHARE
async shareDoc(doc: any) {

  const key = await this.vaultService.getVaultKey();
  if (!key) return;

  const signedUrl = await this.supabaseService.getSignedUrl(doc.file_url);
  if (!signedUrl) return;

  try {
    const res = await fetch(signedUrl);
    const encryptedText = await res.text();

    const decrypted = decryptData(encryptedText, key);

    const safeBuffer = new Uint8Array(decrypted).buffer;

    const blob = new Blob([safeBuffer], {
      type: doc.file_url.toLowerCase().includes('.pdf')
        ? 'application/pdf'
        : 'image/jpeg'
    });

    const fileName =
      doc.file_url.split('/').pop()?.replace('.enc', '') || 'file';

    const file = new File([blob], fileName, { type: blob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    }

  } catch (e) {
    console.error(e);
    alert('Invalid password');
    this.vaultService.clearKey();
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
}