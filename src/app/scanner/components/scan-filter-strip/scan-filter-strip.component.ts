import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { SCAN_FILTERS, ScanFilterType } from '../../models/scanner.models';

@Component({
  selector: 'app-scan-filter-strip',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './scan-filter-strip.component.html',
  styleUrls: ['./scan-filter-strip.component.scss'],
})
export class ScanFilterStripComponent {

  @Input() selected: ScanFilterType = 'enhanced';
  @Input() thumbnailUrl: string | null = null;

  @Output() selectedChange = new EventEmitter<ScanFilterType>();

  filters = SCAN_FILTERS;

  choose(filter: ScanFilterType) {
    this.selectedChange.emit(filter);
  }
}
