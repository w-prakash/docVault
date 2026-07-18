import { Injectable } from '@angular/core';
import { OfflineVaultService } from './offline-vault.service';
import { GoogleDriveService } from '../core/google/drive/google-drive.service';
import { VaultService } from './vault.service';
import { SyncStatusService } from './sync-status';
import { decryptData } from '../utils/encryption.util';

export interface DecryptedDocument {
  blob: Blob;
  blobUrl: string;
  fileName: string;
}

export class DocumentNotCachedOfflineError extends Error {
  constructor() {
    super('This document isn\'t downloaded yet — connect to the internet once to view it.');
    this.name = 'DocumentNotCachedOfflineError';
  }
}

/**
 * Single shared place for "get me this document's decrypted bytes,
 * downloading it first if needed." Wraps the same primitives
 * DocumentsPage already used inline (OfflineVaultService for local
 * cache + encrypted read/write, GoogleDriveService for the download,
 * VaultService for the decryption key, decryptData for the actual
 * decrypt) so nothing about encryption or Drive access is reimplemented —
 * this is purely orchestration, reusable by any page that needs to open
 * a document (documents list, PDF viewer, future preview surfaces).
 */
@Injectable({ providedIn: 'root' })
export class DocumentContentService {

  constructor(
    private offlineVault: OfflineVaultService,
    private driveService: GoogleDriveService,
    private vaultService: VaultService,
    private syncStatus: SyncStatusService
  ) {}

  getFileName(doc: any): string | null {
    return doc.local_file_name || doc.file_url?.split('/')?.pop() || null;
  }

  /**
   * Ensures the encrypted file exists in the local cache, downloading it
   * from Drive first if necessary. Mirrors DocumentsPage.ensureLocalFile's
   * download step exactly (fileExists → downloadMedia → saveEncryptedFile)
   * without the thumbnail-generation side effect, which only the
   * documents list needs.
   */
  async ensureCached(doc: any, onProgress?: (percent: number) => void): Promise<boolean> {

    const fileName = this.getFileName(doc);
    if (!fileName) return false;

    const exists = await this.offlineVault.fileExists(fileName);
    if (exists) return true;

    let online = true;
    this.syncStatus.isOnline$.subscribe(v => (online = v)).unsubscribe();

    if (!online) {
      throw new DocumentNotCachedOfflineError();
    }

    if (!doc.server_id) return false;

    const blob = await this.driveService.downloadMedia(doc.server_id, onProgress);
    const encryptedText = await blob.text();

    const localPath = await this.offlineVault.saveEncryptedFile(fileName, encryptedText);

    await this.offlineVault.documents.update(doc.id, {
      local_path: localPath,
      local_file_name: fileName
    });

    return true;
  }

  /**
   * Full ensure-cached → read → decrypt → Blob pipeline. Returns an object
   * URL the caller must revoke when done (see revoke()).
   */
  async getDecryptedDocument(doc: any, onProgress?: (percent: number) => void): Promise<DecryptedDocument> {

    const cached = await this.ensureCached(doc, onProgress);
    if (!cached) {
      throw new Error('Unable to load file');
    }

    const fileName = this.getFileName(doc)!;
    const encryptedText = await this.offlineVault.readEncryptedFile(fileName);

    if (!encryptedText) {
      throw new Error('File missing from cache');
    }

    const key = this.vaultService.currentKey;
    const decrypted = decryptData(encryptedText, key);
    const safeBuffer = new Uint8Array(decrypted).buffer;

    const blob = new Blob([safeBuffer], { type: doc.file_type || 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    return { blob, blobUrl, fileName };
  }

  revoke(document: DecryptedDocument): void {
    URL.revokeObjectURL(document.blobUrl);
  }
}
