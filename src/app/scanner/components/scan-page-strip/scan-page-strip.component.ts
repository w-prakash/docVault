import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ScanPage } from '../../models/scanner.models';

@Component({
  selector: 'app-scan-page-strip',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './scan-page-strip.component.html',
  styleUrls: ['./scan-page-strip.component.scss'],
})
export class ScanPageStripComponent {

  @Input() pages: ScanPage[] = [];
  @Input() activePageId: string | null = null;

  @Output() select = new EventEmitter<string>();
  @Output() addPage = new EventEmitter<void>();
  @Output() deletePage = new EventEmitter<string>();
  @Output() moveUp = new EventEmitter<string>();
  @Output() moveDown = new EventEmitter<string>();

  thumb(page: ScanPage): string {
    return page.finalDataUrl ?? page.correctedDataUrl ?? page.rawDataUrl;
  }
}
