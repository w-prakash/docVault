import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { ScanPage } from '../models/scanner.models';

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PAGE_MARGIN_PT = 0; // full-bleed scans, edge to edge like Adobe Scan / Lens

@Injectable({ providedIn: 'root' })
export class ScannerPdfService {

  /** Builds a single multi-page PDF from the given (already-finalized) pages. */
  async buildPdf(pages: ScanPage[], fileName: string): Promise<File> {

    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const dataUrl = page.finalDataUrl ?? page.correctedDataUrl ?? page.rawDataUrl;

      if (i > 0) {
        doc.addPage();
      }

      const dims = await this.getImageDimensions(dataUrl);
      const { drawWidth, drawHeight, x, y } = this.fitToPage(dims.width, dims.height);

      doc.addImage(dataUrl, 'JPEG', x, y, drawWidth, drawHeight, undefined, 'FAST');
    }

    const blob = doc.output('blob');
    return new File([blob], fileName, { type: 'application/pdf' });
  }

  /** Builds one image File (JPG or PNG) per page. */
  async buildImages(pages: ScanPage[], format: 'jpg' | 'png', baseName: string): Promise<File[]> {

    const files: File[] = [];
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = format === 'png' ? 'png' : 'jpg';

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const dataUrl = page.finalDataUrl ?? page.correctedDataUrl ?? page.rawDataUrl;

      const converted = format === 'png' ? await this.convertDataUrl(dataUrl, mime) : dataUrl;

      const blob = await (await fetch(converted)).blob();
      const suffix = pages.length > 1 ? `_page${i + 1}` : '';
      files.push(new File([blob], `${baseName}${suffix}.${ext}`, { type: mime }));
    }

    return files;
  }

  private async convertDataUrl(dataUrl: string, mime: string): Promise<string> {
    const img = await this.loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL(mime);
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /** Scales the image to fill the A4 page (minus margin) while preserving aspect ratio. */
  private fitToPage(width: number, height: number) {
    const maxWidth = A4_WIDTH_PT - PAGE_MARGIN_PT * 2;
    const maxHeight = A4_HEIGHT_PT - PAGE_MARGIN_PT * 2;

    const scale = Math.min(maxWidth / width, maxHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;

    return {
      drawWidth,
      drawHeight,
      x: (A4_WIDTH_PT - drawWidth) / 2,
      y: (A4_HEIGHT_PT - drawHeight) / 2,
    };
  }
}
