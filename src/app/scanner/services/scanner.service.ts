import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { DocumentDetectionService } from './document-detection.service';
import { ImageProcessingService } from './image-processing.service';
import { OcrService } from './ocr/ocr.service';
import {
  DEFAULT_ADJUSTMENTS,
  ScanAdjustments,
  ScanCorners,
  ScanFilterType,
  ScanPage,
  createEmptyCorners,
  generateScanId,
} from '../models/scanner.models';

@Injectable({ providedIn: 'root' })
export class ScannerService {

  private pagesSubject = new BehaviorSubject<ScanPage[]>([]);
  readonly pages$ = this.pagesSubject.asObservable();

  private busySubject = new BehaviorSubject<{ busy: boolean; message: string }>({ busy: false, message: '' });
  readonly busy$ = this.busySubject.asObservable();

  constructor(
    private detectionService: DocumentDetectionService,
    private processingService: ImageProcessingService,
    private ocrService: OcrService
  ) {}

  get pages(): ScanPage[] {
    return this.pagesSubject.value;
  }

  reset(): void {
    this.pagesSubject.next([]);
  }

  // ===================================================================
  // CAPTURE
  // ===================================================================

  /**
   * Opens the native camera (rear camera, flash auto, high resolution,
   * auto focus are all Capacitor Camera defaults on-device) and returns
   * a brand-new page with edges already auto-detected.
   */
  async captureNewPage(): Promise<ScanPage> {

    const photo = await Camera.getPhoto({
      quality: 92,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      direction: 'rear' as any,
      allowEditing: false,
      correctOrientation: true,
      saveToGallery: false,
    });

    console.log('🟢 [scan] Camera response:', { webPath: photo.webPath, format: photo.format });

    if (!photo.webPath) {
      throw new Error('Camera capture returned no image data');
    }

    const dataUrl = await this.uriToDataUrl(photo.webPath);
    return this.createPageFromDataUrl(dataUrl);
  }

  /** Adds a page from an existing gallery image, same pipeline as a camera capture. */
  async addPageFromGallery(): Promise<ScanPage> {
    const photo = await Camera.getPhoto({
      quality: 92,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos,
      correctOrientation: true,
    });

    console.log('🟢 [scan] Gallery response:', { webPath: photo.webPath, format: photo.format });

    if (!photo.webPath) {
      throw new Error('Gallery pick returned no image data');
    }

    const dataUrl = await this.uriToDataUrl(photo.webPath);
    return this.createPageFromDataUrl(dataUrl);
  }

  /**
   * Converts a Capacitor Camera `webPath` (a blob: URL the WebView can fetch
   * directly, no native-bridge marshaling involved) into a data: URL.
   *
   * WHY: requesting `CameraResultType.DataUrl` directly makes Capacitor
   * base64-encode the image natively and pass the whole string across the
   * JS bridge in one message. That's fine for small camera-compressed
   * photos, but full-resolution gallery originals can be tens of MB —
   * on Android WebView that bridge transfer is a well-known source of
   * hangs/OOM crashes (doesn't show up in the browser build, which has no
   * native bridge). Fetching the blob: URL directly and reading it with
   * FileReader in JS sidesteps the bridge entirely. Same pattern already
   * used for camera capture in upload.page.ts.
   */
  private uriToDataUrl(webPath: string): Promise<string> {
    console.log('🟢 [scan] Image URI:', webPath);
    return fetch(webPath)
      .then(res => res.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }));
  }

  private async createPageFromDataUrl(dataUrl: string): Promise<ScanPage> {

    this.setBusy(true, 'Detecting document edges...');

    try {
      await this.nextFrame();
      const img = await this.loadImage(dataUrl);

      let corners: ScanCorners;
      let detected = true;
      try {
        const result = await this.detectionService.detect(img);
        corners = result.corners;
        detected = result.detected;
      } catch {
        corners = createEmptyCorners(img.naturalWidth, img.naturalHeight);
        detected = false;
      }

      const page: ScanPage = {
        id: generateScanId(),
        rawDataUrl: dataUrl,
        rawWidth: img.naturalWidth,
        rawHeight: img.naturalHeight,
        corners,
        detected,
        correctedDataUrl: null,
        rotation: 0,
        filter: 'enhanced',
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        finalDataUrl: null,
        createdAt: Date.now(),
      };

      this.pagesSubject.next([...this.pages, page]);
      return page;

    } finally {
      this.setBusy(false, '');
    }
  }

  // ===================================================================
  // CORNER ADJUSTMENT + PERSPECTIVE CORRECTION
  // ===================================================================

  async updateCorners(pageId: string, corners: ScanCorners): Promise<void> {
    this.patchPage(pageId, { corners });
  }

  /** Runs perspective correction using the page's current corners, then re-renders the current filter. */
  async applyPerspectiveCorrection(pageId: string): Promise<ScanPage> {

    const page = this.getPage(pageId);
    this.setBusy(true, 'Flattening document...');

    try {
      await this.nextFrame(); // let the busy overlay actually paint before the heavy work below
      const img = await this.loadImage(page.rawDataUrl);
      const correctedDataUrl = await this.processingService.perspectiveCorrect(img, page.corners);

      this.patchPage(pageId, { correctedDataUrl });
      return this.renderFinal(pageId);

    } finally {
      this.setBusy(false, '');
    }
  }

  // ===================================================================
  // FILTERS / ADJUSTMENTS / ROTATION
  // ===================================================================

  async setFilter(pageId: string, filter: ScanFilterType): Promise<ScanPage> {
    this.patchPage(pageId, { filter });
    return this.renderFinal(pageId);
  }

  async setAdjustments(pageId: string, adjustments: ScanAdjustments): Promise<ScanPage> {
    this.patchPage(pageId, { adjustments });
    return this.renderFinal(pageId);
  }

  async rotatePage(pageId: string): Promise<ScanPage> {
    const page = this.getPage(pageId);
    const next = ((page.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    this.patchPage(pageId, { rotation: next });
    return this.renderFinal(pageId);
  }

  /** Re-runs filter + adjustments + rotation on top of the corrected image to produce `finalDataUrl`. */
  private async renderFinal(pageId: string): Promise<ScanPage> {

    const page = this.getPage(pageId);
    const base = page.correctedDataUrl ?? page.rawDataUrl;

    this.setBusy(true, 'Applying enhancements...');

    try {
      await this.nextFrame();
      const rotated = await this.processingService.rotate(base, page.rotation);
      const finalDataUrl = await this.processingService.applyFilterAndAdjustments(
        rotated,
        page.filter,
        page.adjustments
      );

      this.patchPage(pageId, { finalDataUrl });

      // Fire-and-forget OCR extension point — no-op until a provider is registered.
      this.ocrService.recognize(finalDataUrl).then(result => {
        if (result) {
          this.patchPage(pageId, { ocrText: result.text, ocrConfidence: result.confidence });
        }
      }).catch(() => { /* OCR is best-effort and never blocks the scan flow */ });

      return this.getPage(pageId);

    } finally {
      this.setBusy(false, '');
    }
  }

  // ===================================================================
  // PAGE MANAGEMENT
  // ===================================================================

  deletePage(pageId: string): void {
    this.pagesSubject.next(this.pages.filter(p => p.id !== pageId));
  }

  reorderPages(fromIndex: number, toIndex: number): void {
    const pages = [...this.pages];
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);
    this.pagesSubject.next(pages);
  }

  movePageUp(pageId: string): void {
    const idx = this.pages.findIndex(p => p.id === pageId);
    if (idx > 0) this.reorderPages(idx, idx - 1);
  }

  movePageDown(pageId: string): void {
    const idx = this.pages.findIndex(p => p.id === pageId);
    if (idx >= 0 && idx < this.pages.length - 1) this.reorderPages(idx, idx + 1);
  }

  // ===================================================================
  // HELPERS
  // ===================================================================

  getPage(pageId: string): ScanPage {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) throw new Error(`Scan page ${pageId} not found`);
    return page;
  }

  private patchPage(pageId: string, changes: Partial<ScanPage>): void {
    this.pagesSubject.next(
      this.pages.map(p => (p.id === pageId ? { ...p, ...changes } : p))
    );
  }

  private setBusy(busy: boolean, message: string): void {
    this.busySubject.next({ busy, message });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /** Resolves after the browser has had a chance to paint at least one frame — used to
   * guarantee a busy/loading state is actually visible before a long synchronous task
   * (e.g. an OpenCV warp) blocks the main thread. */
  private nextFrame(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }
}
