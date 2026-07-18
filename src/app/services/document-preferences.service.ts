import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { OfflineVaultService } from './offline-vault.service';

export type DocumentView = 'list' | 'grid';
export type DocumentSortOrder = 'name_asc' | 'name_desc' | 'date_newest' | 'date_oldest';

const DEFAULT_CATEGORY_KEY = 'docprefs_default_category';
const DEFAULT_MEMBER_KEY = 'docprefs_default_member';
const DEFAULT_TYPE_KEY = 'docprefs_default_type';
const DEFAULT_VIEW_KEY = 'docprefs_default_view';
const DEFAULT_SORT_KEY = 'docprefs_default_sort';
const COMPRESS_IMAGES_KEY = 'docprefs_compress_images';
const GENERATE_THUMBNAILS_KEY = 'docprefs_generate_thumbnails';
const GENERATE_PDF_PREVIEW_KEY = 'docprefs_generate_pdf_preview';

export interface DocumentPreferencesSnapshot {
  defaultCategory: string | null;
  defaultMember: string | null;
  defaultType: string | null;
  defaultView: DocumentView;
  defaultSortOrder: DocumentSortOrder;
  compressImagesBeforeUpload: boolean;
  generateThumbnails: boolean;
  generatePdfPreview: boolean;
}

/**
 * Backing service for Settings → Document Preferences. Dropdown option
 * lists (categories/members/types) are sourced live from OfflineVaultService
 * — the same tables the upload flow already uses — so there's no second
 * copy of that data to keep in sync.
 */
@Injectable({ providedIn: 'root' })
export class DocumentPreferencesService {

  constructor(private offlineVault: OfflineVaultService) {}

  async getCategoryOptions(): Promise<any[]> {
    return this.offlineVault.getCategories();
  }

  async getMemberOptions(): Promise<any[]> {
    return this.offlineVault.getMembers();
  }

  async getTypeOptions(): Promise<any[]> {
    return this.offlineVault.getTypes();
  }

  private async getStr(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value || null;
  }

  private async setStr(key: string, value: string | null): Promise<void> {
    if (value === null) {
      await Preferences.remove({ key });
    } else {
      await Preferences.set({ key, value });
    }
  }

  private async getBool(key: string, def: boolean): Promise<boolean> {
    const { value } = await Preferences.get({ key });
    return value === null ? def : value === 'true';
  }

  private async setBool(key: string, value: boolean): Promise<void> {
    await Preferences.set({ key, value: String(value) });
  }

  getDefaultCategory(): Promise<string | null> { return this.getStr(DEFAULT_CATEGORY_KEY); }
  setDefaultCategory(v: string | null): Promise<void> { return this.setStr(DEFAULT_CATEGORY_KEY, v); }

  getDefaultMember(): Promise<string | null> { return this.getStr(DEFAULT_MEMBER_KEY); }
  setDefaultMember(v: string | null): Promise<void> { return this.setStr(DEFAULT_MEMBER_KEY, v); }

  getDefaultType(): Promise<string | null> { return this.getStr(DEFAULT_TYPE_KEY); }
  setDefaultType(v: string | null): Promise<void> { return this.setStr(DEFAULT_TYPE_KEY, v); }

  async getDefaultView(): Promise<DocumentView> {
    return ((await this.getStr(DEFAULT_VIEW_KEY)) as DocumentView) || 'list';
  }
  setDefaultView(v: DocumentView): Promise<void> { return this.setStr(DEFAULT_VIEW_KEY, v); }

  async getDefaultSortOrder(): Promise<DocumentSortOrder> {
    return ((await this.getStr(DEFAULT_SORT_KEY)) as DocumentSortOrder) || 'date_newest';
  }
  setDefaultSortOrder(v: DocumentSortOrder): Promise<void> { return this.setStr(DEFAULT_SORT_KEY, v); }

  getCompressImagesBeforeUpload(): Promise<boolean> { return this.getBool(COMPRESS_IMAGES_KEY, true); }
  setCompressImagesBeforeUpload(v: boolean): Promise<void> { return this.setBool(COMPRESS_IMAGES_KEY, v); }

  getGenerateThumbnails(): Promise<boolean> { return this.getBool(GENERATE_THUMBNAILS_KEY, true); }
  setGenerateThumbnails(v: boolean): Promise<void> { return this.setBool(GENERATE_THUMBNAILS_KEY, v); }

  getGeneratePdfPreview(): Promise<boolean> { return this.getBool(GENERATE_PDF_PREVIEW_KEY, true); }
  setGeneratePdfPreview(v: boolean): Promise<void> { return this.setBool(GENERATE_PDF_PREVIEW_KEY, v); }

  async getSnapshot(): Promise<DocumentPreferencesSnapshot> {

    const [
      defaultCategory, defaultMember, defaultType, defaultView, defaultSortOrder,
      compressImagesBeforeUpload, generateThumbnails, generatePdfPreview
    ] = await Promise.all([
      this.getDefaultCategory(),
      this.getDefaultMember(),
      this.getDefaultType(),
      this.getDefaultView(),
      this.getDefaultSortOrder(),
      this.getCompressImagesBeforeUpload(),
      this.getGenerateThumbnails(),
      this.getGeneratePdfPreview()
    ]);

    return {
      defaultCategory, defaultMember, defaultType, defaultView, defaultSortOrder,
      compressImagesBeforeUpload, generateThumbnails, generatePdfPreview
    };
  }
}
