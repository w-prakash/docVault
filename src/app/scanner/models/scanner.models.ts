// =====================================================================
// SCANNER MODELS
// =====================================================================
// Core domain types for the Document Scanner feature. Kept dependency
// free (no OpenCV / Angular imports) so they can be reused by services,
// components, and (later) the OCR module without pulling in heavy deps.
// =====================================================================

/** A single (x, y) point in image pixel space. */
export interface ScanPoint {
  x: number;
  y: number;
}

/** The four corners of a detected/adjusted document quadrilateral. */
export interface ScanCorners {
  topLeft: ScanPoint;
  topRight: ScanPoint;
  bottomLeft: ScanPoint;
  bottomRight: ScanPoint;
}

export type ScanFilterType =
  | 'original'
  | 'enhanced'
  | 'color'
  | 'blackAndWhite'
  | 'grayscale'
  | 'magicColor'
  | 'highContrast';

export interface ScanFilterOption {
  id: ScanFilterType;
  label: string;
  icon: string;
}

export const SCAN_FILTERS: ScanFilterOption[] = [
  { id: 'original', label: 'Original', icon: 'image-outline' },
  { id: 'enhanced', label: 'Enhanced', icon: 'sparkles-outline' },
  { id: 'color', label: 'Color', icon: 'color-palette-outline' },
  { id: 'magicColor', label: 'Magic Color', icon: 'color-wand-outline' },
  { id: 'blackAndWhite', label: 'B & W', icon: 'contrast-outline' },
  { id: 'grayscale', label: 'Grayscale', icon: 'invert-mode-outline' },
  { id: 'highContrast', label: 'High Contrast', icon: 'flash-outline' },
];

/** Fine-grained manual adjustments layered on top of the chosen filter. */
export interface ScanAdjustments {
  /** -100..100, 0 = untouched */
  brightness: number;
  /** -100..100, 0 = untouched */
  contrast: number;
  /** 0..100, 0 = untouched */
  sharpness: number;
}

export const DEFAULT_ADJUSTMENTS: ScanAdjustments = {
  brightness: 0,
  contrast: 0,
  sharpness: 0,
};

export type ScanSaveFormat = 'pdf' | 'jpg' | 'png';

/**
 * A single scanned page as it moves through the pipeline:
 * capture -> detect -> crop/perspective-correct -> enhance -> final.
 */
export interface ScanPage {
  id: string;

  /** Raw camera capture, untouched (data URL). */
  rawDataUrl: string;

  /** Natural pixel dimensions of the raw capture. */
  rawWidth: number;
  rawHeight: number;

  /** Detected (or manually adjusted) document corners, in raw-image pixel space. */
  corners: ScanCorners;

  /** False when auto-detection couldn't find the document and `corners` is
   * the inset default — used to prompt the user to adjust manually. */
  detected: boolean;

  /** Result of perspective correction (flattened, rectangular) — data URL. */
  correctedDataUrl: string | null;

  /** Rotation applied after correction, in degrees (0, 90, 180, 270). */
  rotation: 0 | 90 | 180 | 270;

  /** Selected enhancement filter. */
  filter: ScanFilterType;

  /** Manual fine-tune adjustments layered after the filter. */
  adjustments: ScanAdjustments;

  /** Final rendered output for this page (filter + adjustments + rotation applied) — data URL. */
  finalDataUrl: string | null;

  /**
   * Extension point for future OCR integration (Google ML Kit / Tesseract / Vision).
   * Left undefined until an OCR provider is wired up — see services/ocr/.
   */
  ocrText?: string;
  ocrConfidence?: number;

  createdAt: number;
}

/** A completed multi-page scan, ready to be hashed out into files for upload. */
export interface ScanDocument {
  id: string;
  pages: ScanPage[];
  createdAt: number;
}

/** Result of flattening a ScanDocument into upload-ready files. */
export interface ScanOutputFile {
  file: File;
  previewUrl: string;
}

export function createEmptyCorners(width: number, height: number, inset = 0.06): ScanCorners {
  const mx = width * inset;
  const my = height * inset;
  return {
    topLeft: { x: mx, y: my },
    topRight: { x: width - mx, y: my },
    bottomLeft: { x: mx, y: height - my },
    bottomRight: { x: width - mx, y: height - my },
  };
}

export function generateScanId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
