import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { ScannerService } from './services/scanner.service';
import { ScannerOutputService } from './services/scanner-output.service';
import { ScannerHandoffService } from './services/scanner-handoff.service';

import { ScanCornerOverlayComponent } from './components/scan-corner-overlay/scan-corner-overlay.component';
import { ScanFilterStripComponent } from './components/scan-filter-strip/scan-filter-strip.component';
import { ScanPageStripComponent } from './components/scan-page-strip/scan-page-strip.component';
import { ScanAdjustSlidersComponent } from './components/scan-adjust-sliders/scan-adjust-sliders.component';

import {
  ScanAdjustments,
  ScanCorners,
  ScanFilterType,
  ScanPage,
  ScanSaveFormat,
} from './models/scanner.models';

type ScannerStep = 'capture' | 'crop' | 'enhance' | 'preview';

@Component({
  selector: 'app-scanner',
  standalone: true,
  templateUrl: './scanner.page.html',
  styleUrls: ['./scanner.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ScanCornerOverlayComponent,
    ScanFilterStripComponent,
    ScanPageStripComponent,
    ScanAdjustSlidersComponent,
  ],
})
export class ScannerPage implements OnInit, OnDestroy {

  step: ScannerStep = 'capture';

  pages: ScanPage[] = [];
  activePageId: string | null = null;

  busy = false;
  busyMessage = '';

  showAdjustSliders = false;
  saveFormat: ScanSaveFormat = 'pdf';
  isSaving = false;

  private subs = new Subscription();

  constructor(
    private scannerService: ScannerService,
    private outputService: ScannerOutputService,
    private handoffService: ScannerHandoffService,
    private router: Router,
    private location: Location,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit(): void {
    this.scannerService.reset();

    this.subs.add(
      this.scannerService.pages$.subscribe(pages => {
        this.pages = pages;
      })
    );

    this.subs.add(
      this.scannerService.busy$.subscribe(({ busy, message }) => {
        this.busy = busy;
        this.busyMessage = message;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get activePage(): ScanPage | null {
    return this.pages.find(p => p.id === this.activePageId) ?? null;
  }

  // ===================================================================
  // CAPTURE
  // ===================================================================

  async captureDocument() {
    try {
      const page = await this.scannerService.captureNewPage();
      this.activePageId = page.id;
      this.step = 'crop';
    } catch (e) {
      console.error('❌ Capture failed', e);
      this.showToast('Could not open the camera. Please check permissions.');
    }
  }

  async pickFromGallery() {
    try {
      const page = await this.scannerService.addPageFromGallery();
      this.activePageId = page.id;
      this.step = 'crop';
    } catch (e) {
      console.error('❌ Gallery pick failed', e);
    }
  }

  async retakeCurrentPage() {
    if (this.activePageId) {
      this.scannerService.deletePage(this.activePageId);
    }
    this.step = 'capture';
    await this.captureDocument();
  }

  // ===================================================================
  // CROP / CORNERS
  // ===================================================================

  onCornersChange(corners: ScanCorners) {
    if (!this.activePageId) return;
    this.scannerService.updateCorners(this.activePageId, corners);
  }

  async confirmCrop() {
    if (!this.activePageId) return;
    await this.scannerService.applyPerspectiveCorrection(this.activePageId);
    this.step = 'enhance';
  }

  // ===================================================================
  // ENHANCE (filters, rotate, adjustments)
  // ===================================================================

  async onFilterChange(filter: ScanFilterType) {
    if (!this.activePageId) return;
    await this.scannerService.setFilter(this.activePageId, filter);
  }

  async onAdjustmentsCommitted(adjustments: ScanAdjustments) {
    if (!this.activePageId) return;
    await this.scannerService.setAdjustments(this.activePageId, adjustments);
  }

  async rotateActivePage() {
    if (!this.activePageId) return;
    await this.scannerService.rotatePage(this.activePageId);
  }

  async recropActivePage() {
    this.step = 'crop';
  }

  toggleAdjustSliders() {
    this.showAdjustSliders = !this.showAdjustSliders;
  }

  // ===================================================================
  // MULTI-PAGE MANAGEMENT
  // ===================================================================

  selectPage(pageId: string) {
    this.activePageId = pageId;
    this.step = 'enhance';
  }

  async addAnotherPage() {
    this.step = 'capture';
    await this.captureDocument();
  }

  async deletePage(pageId: string) {
    this.scannerService.deletePage(pageId);

    if (this.pages.length === 0) {
      this.step = 'capture';
      this.activePageId = null;
      return;
    }

    if (this.activePageId === pageId) {
      this.activePageId = this.pages[0].id;
    }
  }

  moveUp(pageId: string) {
    this.scannerService.movePageUp(pageId);
  }

  moveDown(pageId: string) {
    this.scannerService.movePageDown(pageId);
  }

  // ===================================================================
  // PREVIEW / SAVE
  // ===================================================================

  goToPreview() {
    this.step = 'preview';
  }

  backToEnhance() {
    this.step = 'enhance';
  }

  pageThumb(page: ScanPage): string {
    return page.finalDataUrl ?? page.correctedDataUrl ?? page.rawDataUrl;
  }

  async saveAndUpload() {
    if (!this.pages.length) return;

    this.isSaving = true;

    try {
      const files = await this.outputService.build(this.pages, this.saveFormat);

      const previews = files.map(file => ({
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
      }));

      this.handoffService.set(files, previews);
      this.scannerService.reset();

      this.router.navigateByUrl('/upload');

    } catch (e) {
      console.error('❌ Failed to build scan output', e);
      this.showToast('Something went wrong generating your document. Please try again.');
    } finally {
      this.isSaving = false;
    }
  }

  // ===================================================================
  // NAVIGATION / EXIT
  // ===================================================================

  async confirmExit() {
    if (!this.pages.length) {
      this.location.back();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Discard scan?',
      message: `You have ${this.pages.length} page${this.pages.length > 1 ? 's' : ''} that haven't been saved yet.`,
      cssClass: 'vault-action-sheet',
      buttons: [
        { text: 'Keep Scanning', role: 'cancel' },
        {
          text: 'Discard',
          role: 'destructive',
          handler: () => {
            this.scannerService.reset();
            this.location.back();
          },
        },
      ],
    });

    await alert.present();
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2200,
      position: 'bottom',
      cssClass: 'vault-toast',
    });
    await toast.present();
  }
}
