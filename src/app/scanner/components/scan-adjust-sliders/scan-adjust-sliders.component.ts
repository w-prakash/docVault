import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ScanAdjustments } from '../../models/scanner.models';

@Component({
  selector: 'app-scan-adjust-sliders',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './scan-adjust-sliders.component.html',
  styleUrls: ['./scan-adjust-sliders.component.scss'],
})
export class ScanAdjustSlidersComponent {
  @Input() adjustments!: ScanAdjustments;
  @Output() adjustmentsChange = new EventEmitter<ScanAdjustments>();
  @Output() adjustmentsCommitted = new EventEmitter<ScanAdjustments>();

  onInput() {
    this.adjustmentsChange.emit({ ...this.adjustments });
  }

  onCommit() {
    this.adjustmentsCommitted.emit({ ...this.adjustments });
  }
}
