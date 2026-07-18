import { Injectable } from '@angular/core';
import { ScannerPdfService } from './scanner-pdf.service';
import { ScanPage, ScanSaveFormat } from '../models/scanner.models';

@Injectable({ providedIn: 'root' })
export class ScannerOutputService {

  constructor(private pdfService: ScannerPdfService) {}

  /**
   * Converts finished scan pages into File objects ready for the existing
   * upload pipeline (encryption, thumbnailing, Drive upload all reused
   * as-is — this service only ever hands back plain File[]).
   */
  async build(pages: ScanPage[], format: ScanSaveFormat): Promise<File[]> {

    if (!pages.length) return [];

    const baseName = `Scan_${this.timestamp()}`;

    if (format === 'pdf') {
      const file = await this.pdfService.buildPdf(pages, `${baseName}.pdf`);
      return [file];
    }

    return this.pdfService.buildImages(pages, format, baseName);
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
}
