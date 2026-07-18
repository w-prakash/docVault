import { Injectable } from '@angular/core';

export interface ScannerHandoffPreview {
  name: string;
  type: string;
  url: string;
}

/**
 * Carries the scanner's finished File[] over to the existing UploadPage
 * so the scanner never re-implements encryption / thumbnailing / Drive
 * upload / offline caching — it just hands off into the same door the
 * "Gallery" picker already uses.
 *
 * UploadPage reads (and clears) `consume()` once in ngOnInit.
 */
@Injectable({ providedIn: 'root' })
export class ScannerHandoffService {

  private pendingFiles: File[] = [];
  private pendingPreviews: ScannerHandoffPreview[] = [];

  set(files: File[], previews: ScannerHandoffPreview[]): void {
    this.pendingFiles = files;
    this.pendingPreviews = previews;
  }

  hasPending(): boolean {
    return this.pendingFiles.length > 0;
  }

  /** Returns and clears the pending hand-off — call exactly once per upload visit. */
  consume(): { files: File[]; previews: ScannerHandoffPreview[] } {
    const files = this.pendingFiles;
    const previews = this.pendingPreviews;
    this.pendingFiles = [];
    this.pendingPreviews = [];
    return { files, previews };
  }
}
