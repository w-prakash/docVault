import { CommonModule } from '@angular/common';
import {
  Component, ElementRef, EventEmitter, Input, OnChanges,
  Output, SimpleChanges, ViewChild, AfterViewInit
} from '@angular/core';
import { ScanCorners } from '../../models/scanner.models';

type HandleKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

@Component({
  selector: 'app-scan-corner-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scan-corner-overlay.component.html',
  styleUrls: ['./scan-corner-overlay.component.scss'],
})
export class ScanCornerOverlayComponent implements OnChanges, AfterViewInit {

  @Input() imageUrl!: string;
  @Input() naturalWidth!: number;
  @Input() naturalHeight!: number;
  @Input() corners!: ScanCorners;

  @Output() cornersChange = new EventEmitter<ScanCorners>();

  @ViewChild('stage', { static: true }) stageRef!: ElementRef<HTMLDivElement>;

  displayCorners: ScanCorners = this.corners;
  handleKeys: HandleKey[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private draggingHandle: HandleKey | null = null;

  ngAfterViewInit(): void {
    this.recalculateScale();
    window.addEventListener('resize', () => this.recalculateScale());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['corners'] && this.corners) {
      this.recalculateScale();
    }
  }

  private recalculateScale(): void {
    if (!this.stageRef || !this.naturalWidth) return;

    const rect = this.stageRef.nativeElement.getBoundingClientRect();
    const scaleX = rect.width / this.naturalWidth;
    const scaleY = rect.height / this.naturalHeight;
    this.scale = Math.min(scaleX, scaleY);

    const renderedWidth = this.naturalWidth * this.scale;
    const renderedHeight = this.naturalHeight * this.scale;
    this.offsetX = (rect.width - renderedWidth) / 2;
    this.offsetY = (rect.height - renderedHeight) / 2;
  }

  /** Corner position in on-screen (display) pixels, for the SVG. */
  displayPoint(key: HandleKey) {
    const p = this.corners[key];
    return {
      x: p.x * this.scale + this.offsetX,
      y: p.y * this.scale + this.offsetY,
    };
  }

  /** Ordered so the polygon draws a proper quad outline (TL -> TR -> BR -> BL). */
  get outlinePoints(): string {
    const tl = this.displayPoint('topLeft');
    const tr = this.displayPoint('topRight');
    const br = this.displayPoint('bottomRight');
    const bl = this.displayPoint('bottomLeft');
    return [tl, tr, br, bl].map(p => `${p.x},${p.y}`).join(' ');
  }

  onHandlePointerDown(key: HandleKey, event: PointerEvent): void {
    event.preventDefault();
    this.draggingHandle = key;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  onStagePointerMove(event: PointerEvent): void {
    if (!this.draggingHandle) return;

    const rect = this.stageRef.nativeElement.getBoundingClientRect();
    const displayX = event.clientX - rect.left;
    const displayY = event.clientY - rect.top;

    const naturalX = this.clamp((displayX - this.offsetX) / this.scale, 0, this.naturalWidth);
    const naturalY = this.clamp((displayY - this.offsetY) / this.scale, 0, this.naturalHeight);

    const updated: ScanCorners = {
      ...this.corners,
      [this.draggingHandle]: { x: naturalX, y: naturalY },
    };

    this.cornersChange.emit(updated);
  }

  onStagePointerUp(): void {
    this.draggingHandle = null;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
  }
}
