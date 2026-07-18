// =====================================================================
// OCR EXTENSION POINT (future-ready — not implemented)
// =====================================================================
// The scanner pipeline is intentionally shaped so OCR can be dropped in
// later without touching ScannerService's public API: any provider that
// implements OcrProvider can be registered in OcrService.setProvider().
//
// Candidate providers to wire up later:
//   - Google ML Kit Text Recognition (on-device, via a Capacitor plugin)
//   - Tesseract.js (in-WebView, no native plugin required)
//   - Google Cloud Vision API (server-side, needs network + API key)
// =====================================================================

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrProvider {
  readonly name: string;
  recognize(imageDataUrl: string): Promise<OcrResult>;
}
