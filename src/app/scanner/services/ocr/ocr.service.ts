import { Injectable } from '@angular/core';
import { OcrProvider, OcrResult } from './ocr-provider.interface';

/**
 * Deliberately not implemented yet (per spec: "prepare extension points,
 * do not implement OCR now"). ScannerService already calls into this
 * service after each page is finalized — once a provider is registered
 * here, OCR turns on for the whole app with no other changes needed.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {

  private provider: OcrProvider | null = null;

  setProvider(provider: OcrProvider): void {
    this.provider = provider;
  }

  get isAvailable(): boolean {
    return !!this.provider;
  }

  async recognize(imageDataUrl: string): Promise<OcrResult | null> {
    if (!this.provider) {
      // No-op until a provider (ML Kit / Tesseract / Vision) is registered.
      return null;
    }
    return this.provider.recognize(imageDataUrl);
  }
}
