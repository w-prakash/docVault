import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { GoogleDriveService } from './google-drive.service';
import { DriveOfflineError } from './google-drive.models';

const FOLDER_ID_KEY = 'docvault_drive_folder_id';
const FOLDER_NAME = 'DocVault';

@Injectable({
  providedIn: 'root'
})
export class DocVaultFolderService {

  constructor(
    private readonly driveService: GoogleDriveService
  ) {}

  /**
   * Returns the Drive folder ID for the app's "DocVault" folder.
   * - If already cached locally, returns immediately — no network call, works fully offline.
   * - Otherwise searches Drive for an existing folder, creating one if none exists.
   * - Caches the result so this only ever runs once per device.
   */
  async getFolderId(): Promise<string> {

    const cached = await this.getCachedFolderId();

    if (cached) {
      return cached;
    }

    const folderId = await this.resolveFolderId();

    await this.cacheFolderId(folderId);

    return folderId;

  }

  /** Call once after a successful Google sign-in. Cheap no-op if already resolved. */
  async ensureDocVaultFolder(): Promise<string> {
    return this.getFolderId();
  }

  async clearCache(): Promise<void> {
    await Preferences.remove({ key: FOLDER_ID_KEY });
  }

  // =====================================
  // PRIVATE
  // =====================================

  private async resolveFolderId(): Promise<string> {

    try {

      const query =
        `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'me' in owners`;

      const result = await this.driveService.listFiles(query);

      const existing = result.files?.[0];

      if (existing) {
        console.log('✅ Found existing DocVault folder:', existing.id);
        return existing.id;
      }

      console.log('📁 No DocVault folder found — creating one');

      const created = await this.driveService.createFolder(FOLDER_NAME);

      return created.id;

    } catch (err) {

      if (err instanceof DriveOfflineError) {
        throw new Error('Cannot set up DocVault folder while offline — connect to the internet once to finish setup.');
      }

      throw err;

    }
  }

  private async getCachedFolderId(): Promise<string | null> {
    const { value } = await Preferences.get({ key: FOLDER_ID_KEY });
    return value || null;
  }

  private async cacheFolderId(folderId: string): Promise<void> {
    await Preferences.set({ key: FOLDER_ID_KEY, value: folderId });
  }

}