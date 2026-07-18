import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ActionSheetController, ToastController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import * as pdfjsLib from 'pdfjs-dist';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { OfflineVaultService } from 'src/app/services/offline-vault.service';
import {
  DocumentContentService,
  DecryptedDocument,
  DocumentNotCachedOfflineError
} from 'src/app/services/document-content.service';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';

interface PdfPage {
  pageNumber: number;
  width: number;   // CSS px at current fit scale
  height: number;  // CSS px at current fit scale
  rendered: boolean;
  renderScale: number;
}

const RENDER_WINDOW = 2; // pages kept rendered on either side of the visible page
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './pdf-viewer.page.html',
  styleUrls: ['./pdf-viewer.page.scss']
})
export class PdfViewerPage implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('scrollContainer') scrollContainerRef?: ElementRef<HTMLDivElement>;

  // ── Doc / loading state ──────────────────────────────────────────────
  doc: any = null;
  docName = 'Document';

  loading = true;
  downloadProgress = 0;
  statusMessage = 'Preparing document…';

  error: string | null = null;
  offlineNotCached = false;

  // ── PDF state ─────────────────────────────────────────────────────────
  private pdfProxy: any = null;
  private decrypted: DecryptedDocument | null = null;

  pages: PdfPage[] = [];
  numPages = 0;
  currentPage = 1;

  fitWidthScale = 1;   // scale that makes a page exactly fill the container width
  zoomMultiplier = 1;  // committed, on top of fitWidthScale (persists across renders)
  liveTransform = 1;   // transient pinch/drag transform applied via CSS only

  darkReadingMode = false;

  // ── Search ────────────────────────────────────────────────────────────
  showSearch = false;
  searchQuery = '';
  searching = false;
  searchMatches: number[] = [];
  searchMatchIndex = 0;

  private renderedCanvases = new Map<number, HTMLCanvasElement>();
  private observer?: IntersectionObserver;
  private pinchStartDistance = 0;
  private pinchActive = false;
  private lastTapTime = 0;
  private commitZoomTimer: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private offlineVault: OfflineVaultService,
    private documentContent: DocumentContentService,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.load();
  }

  ngAfterViewInit() {
    // Observer is (re)attached once pages exist — see setupObserver(), called after load().
  }

  ngOnDestroy() {
    this.cleanup();
  }

  // =====================================
  // LOAD / DECRYPT / PARSE
  // =====================================

  async load() {

    this.loading = true;
    this.error = null;
    this.offlineNotCached = false;
    this.downloadProgress = 0;
    this.statusMessage = 'Locating document…';

    try {

      const id = Number(this.route.snapshot.paramMap.get('id'));
      const doc = await this.offlineVault.documents.get(id);

      if (!doc) {
        this.error = 'Document not found.';
        this.loading = false;
        return;
      }

      this.doc = doc;
      this.docName = doc.original_name || doc.local_file_name || 'Document';

      this.statusMessage = 'Downloading…';

      const decrypted = await this.documentContent.getDecryptedDocument(doc, percent => {
        this.downloadProgress = percent;
        this.cdr.detectChanges();
      });

      this.decrypted = decrypted;
      this.statusMessage = 'Rendering…';

      const arrayBuffer = await decrypted.blob.arrayBuffer();

      this.pdfProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      this.numPages = this.pdfProxy.numPages;

      await this.computeLayout();

      this.loading = false;
      this.cdr.detectChanges();

      // Observer needs the *ngFor-rendered page elements, which only
      // exist after this change detection pass.
      setTimeout(() => this.setupObserver(), 0);

    } catch (err) {

      this.loading = false;

      if (err instanceof DocumentNotCachedOfflineError) {
        this.offlineNotCached = true;
        this.error = err.message;
      } else {
        console.error('❌ PDF viewer load failed', err);
        this.error = 'Unable to open this document.';
      }
    }
  }

  async retry() {
    await this.load();
  }

  private async computeLayout() {

    const containerWidth = this.scrollContainerRef?.nativeElement.clientWidth
      || window.innerWidth - 32;

    const firstPage = await this.pdfProxy.getPage(1);
    const nativeViewport = firstPage.getViewport({ scale: 1 });

    this.fitWidthScale = containerWidth / nativeViewport.width;

    const pages: PdfPage[] = [];

    for (let i = 1; i <= this.numPages; i++) {

      // Only page 1's exact viewport is measured up front (cheap); other
      // pages assume the same aspect ratio for initial layout sizing —
      // corrected to their real size the moment they're rendered. This
      // keeps startup fast even for very large PDFs.
      const scale = this.effectiveScale();

      pages.push({
        pageNumber: i,
        width: nativeViewport.width * scale,
        height: nativeViewport.height * scale,
        rendered: false,
        renderScale: 0
      });
    }

    this.pages = pages;
  }

  private effectiveScale(): number {
    return this.fitWidthScale * this.zoomMultiplier;
  }

  // =====================================
  // LAZY RENDER WINDOW (IntersectionObserver)
  // =====================================

  private setupObserver() {

    this.observer?.disconnect();

    const root = this.scrollContainerRef?.nativeElement;
    if (!root) return;

    this.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const pageNum = Number((entry.target as HTMLElement).dataset['page']);
          if (!pageNum) continue;

          if (entry.isIntersecting) {
            this.currentPage = pageNum;
            this.renderWindowAround(pageNum);
          }
        }
        this.cdr.detectChanges();
      },
      { root, threshold: 0.15 }
    );

    root.querySelectorAll('.pdf-page').forEach(el => this.observer!.observe(el));
  }

  private async renderWindowAround(centerPage: number) {

    const lo = Math.max(1, centerPage - RENDER_WINDOW);
    const hi = Math.min(this.numPages, centerPage + RENDER_WINDOW);

    for (let p = lo; p <= hi; p++) {
      this.renderPage(p);
    }

    // Free memory on pages well outside the window — important for
    // large PDFs / low memory devices.
    for (const page of this.pages) {
      if ((page.pageNumber < lo - RENDER_WINDOW || page.pageNumber > hi + RENDER_WINDOW) && page.rendered) {
        this.evictPage(page.pageNumber);
      }
    }
  }

  private async renderPage(pageNumber: number) {

    const pageState = this.pages.find(p => p.pageNumber === pageNumber);
    if (!pageState) return;

    const scale = this.effectiveScale();

    if (pageState.rendered && pageState.renderScale === scale) return; // already current

    const canvas = this.renderedCanvases.get(pageNumber)
      || (document.getElementById(`pdf-canvas-${pageNumber}`) as HTMLCanvasElement | null);

    if (!canvas) return;

    this.renderedCanvases.set(pageNumber, canvas);

    try {

      const page = await this.pdfProxy.getPage(pageNumber);
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap for memory
      const viewport = page.getViewport({ scale: scale * dpr });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${scale ? viewport.width / dpr : 0}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      const context = canvas.getContext('2d');
      if (!context) return;

      await page.render({ canvasContext: context, viewport }).promise;

      pageState.rendered = true;
      pageState.renderScale = scale;
      pageState.width = viewport.width / dpr;
      pageState.height = viewport.height / dpr;

    } catch (err) {
      console.error('❌ Page render failed', pageNumber, err);
    }
  }

  private evictPage(pageNumber: number) {

    const pageState = this.pages.find(p => p.pageNumber === pageNumber);
    const canvas = this.renderedCanvases.get(pageNumber);

    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }

    if (pageState) {
      pageState.rendered = false;
      pageState.renderScale = 0;
    }
  }

  // =====================================
  // ZOOM: fit width / +- buttons / double-tap / pinch
  // =====================================

  async setFitWidth() {
    this.zoomMultiplier = 1;
    await this.rerenderAllVisible();
  }

  async zoomIn() {
    this.zoomMultiplier = Math.min(MAX_ZOOM, this.zoomMultiplier + 0.25);
    await this.rerenderAllVisible();
  }

  async zoomOut() {
    this.zoomMultiplier = Math.max(MIN_ZOOM, this.zoomMultiplier - 0.25);
    await this.rerenderAllVisible();
  }

  onDoubleTap() {

    const now = Date.now();

    if (now - this.lastTapTime < 300) {
      this.zoomMultiplier = this.zoomMultiplier > 1 ? 1 : 2;
      this.rerenderAllVisible();
    }

    this.lastTapTime = now;
  }

  onTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      this.pinchActive = true;
      this.pinchStartDistance = this.touchDistance(event);
    }
  }

  onTouchMove(event: TouchEvent) {

    if (!this.pinchActive || event.touches.length !== 2) return;

    const distance = this.touchDistance(event);
    const ratio = distance / (this.pinchStartDistance || distance);

    // Smooth, cheap CSS-only feedback during the gesture — no re-render
    // per frame, so pinching stays responsive even on large pages.
    this.liveTransform = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, ratio));
  }

  onTouchEnd() {

    if (!this.pinchActive) return;
    this.pinchActive = false;

    const committed = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoomMultiplier * this.liveTransform));
    this.liveTransform = 1;
    this.zoomMultiplier = committed;

    // Debounce the crisp re-render until the gesture has fully settled.
    clearTimeout(this.commitZoomTimer);
    this.commitZoomTimer = setTimeout(() => this.rerenderAllVisible(), 120);
  }

  private touchDistance(event: TouchEvent): number {
    const [a, b] = [event.touches[0], event.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  private async rerenderAllVisible() {
    await this.computePageSizesForScale();
    await this.renderWindowAround(this.currentPage);
    this.cdr.detectChanges();
  }

  private async computePageSizesForScale() {

    for (const page of this.pages) {
      if (page.rendered) continue; // will be resized precisely on next render
      const ratio = page.height / (page.width || 1);
      const containerWidth = this.scrollContainerRef?.nativeElement.clientWidth || window.innerWidth - 32;
      page.width = containerWidth * this.zoomMultiplier;
      page.height = page.width * ratio;
    }
  }

  // =====================================
  // DARK READING MODE (comfort toggle — inverts rendered canvases)
  // =====================================

  toggleDarkReadingMode() {
    this.darkReadingMode = !this.darkReadingMode;
  }

  // =====================================
  // SEARCH (page-level — jumps to matching pages)
  // =====================================

  toggleSearch() {
    this.showSearch = !this.showSearch;
    if (!this.showSearch) {
      this.searchQuery = '';
      this.searchMatches = [];
    }
  }

  async runSearch() {

    const query = this.searchQuery.trim().toLowerCase();
    if (!query || !this.pdfProxy) {
      this.searchMatches = [];
      return;
    }

    this.searching = true;
    this.searchMatches = [];

    try {

      for (let p = 1; p <= this.numPages; p++) {

        const page = await this.pdfProxy.getPage(p);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(' ').toLowerCase();

        if (text.includes(query)) {
          this.searchMatches.push(p);
        }
      }

      this.searchMatchIndex = 0;

      if (this.searchMatches.length > 0) {
        this.jumpToPage(this.searchMatches[0]);
      } else {
        const toast = await this.toastCtrl.create({
          message: 'No matches found',
          duration: 1500,
          position: 'bottom'
        });
        await toast.present();
      }

    } finally {
      this.searching = false;
    }
  }

  nextMatch() {
    if (this.searchMatches.length === 0) return;
    this.searchMatchIndex = (this.searchMatchIndex + 1) % this.searchMatches.length;
    this.jumpToPage(this.searchMatches[this.searchMatchIndex]);
  }

  previousMatch() {
    if (this.searchMatches.length === 0) return;
    this.searchMatchIndex = (this.searchMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
    this.jumpToPage(this.searchMatches[this.searchMatchIndex]);
  }

  jumpToPage(pageNumber: number) {

    const el = document.querySelector(`.pdf-page[data-page="${pageNumber}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =====================================
  // TOOLBAR ACTIONS
  // =====================================

  goBack() {
    this.router.navigate(['/documents']);
  }

  async shareDocument() {

    if (!this.decrypted) return;

    try {

      const tempFile = `share_${Date.now()}.pdf`;
      const base64 = await this.blobToBase64(this.decrypted.blob);

      await Filesystem.writeFile({ path: tempFile, data: base64, directory: Directory.Cache });
      const uri = await Filesystem.getUri({ path: tempFile, directory: Directory.Cache });

      await Share.share({ title: this.docName, url: uri.uri });

    } catch (err) {
      console.error('❌ Share failed', err);
      const toast = await this.toastCtrl.create({ message: 'Unable to share document', duration: 1500 });
      await toast.present();
    }
  }

  async downloadDocument() {

    if (!this.decrypted) return;

    try {

      const base64 = await this.blobToBase64(this.decrypted.blob);
      const fileName = this.docName.endsWith('.pdf') ? this.docName : `${this.docName}.pdf`;

      await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Documents
      });

      const toast = await this.toastCtrl.create({ message: 'Saved to device', duration: 1500 });
      await toast.present();

    } catch (err) {
      console.error('❌ Download failed', err);
      const toast = await this.toastCtrl.create({ message: 'Unable to save document', duration: 1500 });
      await toast.present();
    }
  }

  async openMoreOptions() {

    const sheet = await this.actionSheetCtrl.create({
      header: this.docName,
      cssClass: 'vault-action-sheet',
      buttons: [
        {
          text: this.darkReadingMode ? 'Disable dark reading mode' : 'Enable dark reading mode',
          icon: 'moon-outline',
          handler: () => this.toggleDarkReadingMode()
        },
        {
          text: 'Open in another app',
          icon: 'open-outline',
          handler: () => this.shareDocument()
        },
        { text: 'Cancel', icon: 'close-outline', role: 'cancel' }
      ]
    });

    await sheet.present();
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // =====================================
  // CLEANUP
  // =====================================

  private cleanup() {

    this.observer?.disconnect();
    clearTimeout(this.commitZoomTimer);

    if (this.decrypted) {
      this.documentContent.revoke(this.decrypted);
      this.decrypted = null;
    }

    try {
      this.pdfProxy?.destroy();
    } catch {
      // already destroyed / never fully loaded
    }

    this.pdfProxy = null;
    this.renderedCanvases.clear();
    this.pages = [];
  }
}
