import { Injectable } from '@angular/core';

declare global {
  interface Window {
    cv: any;
  }
}

/**
 * Lazily loads OpenCV.js (WASM build) from `assets/opencv/opencv.js`.
 *
 * WHY OpenCV.js:
 * Capacitor 4 has no first-party native "edge detection" plugin. OpenCV.js
 * runs entirely inside the WebView (no native plugin/permissions needed),
 * which is the same approach used by most premium web-based scanners
 * (it's what the popular `jscanify` library wraps). That makes it the best
 * fit for an Ionic + Capacitor hybrid app — it works identically on iOS,
 * Android, and the browser, and needs zero native code.
 *
 * SETUP REQUIRED (one-time, not code):
 * Download the official opencv.js WASM build (`opencv.js`, ~8-10MB) from
 * https://docs.opencv.org/4.x/opencv.js and place it at:
 *   src/assets/opencv/opencv.js
 * It is intentionally NOT fetched from a CDN at runtime so the scanner
 * keeps working fully offline inside the WebView.
 */
@Injectable({ providedIn: 'root' })
export class OpenCvLoaderService {

  private loadingPromise: Promise<any> | null = null;
  private scriptUrl = 'assets/opencv/opencv.js';

  /** Resolves with the global `cv` object once OpenCV.js has finished initializing. */
  load(): Promise<any> {

    if (window.cv && window.cv.Mat) {
      return Promise.resolve(window.cv);
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = new Promise((resolve, reject) => {

      const existing = document.querySelector(`script[src="${this.scriptUrl}"]`);

      const onReady = () => {
        if (window.cv?.onRuntimeInitialized !== undefined) {
          // cv.js exposes readiness via this callback in the WASM build.
          window.cv['onRuntimeInitialized'] = () => resolve(window.cv);
        } else if (window.cv) {
          resolve(window.cv);
        } else {
          reject(new Error('OpenCV.js loaded but window.cv is undefined'));
        }
      };

      if (existing) {
        onReady();
        return;
      }

      const script = document.createElement('script');
      script.src = this.scriptUrl;
      script.async = true;

      script.onload = onReady;

      script.onerror = () => {
        this.loadingPromise = null;
        reject(new Error(`Failed to load OpenCV.js from ${this.scriptUrl}`));
      };

      document.body.appendChild(script);

      // Safety timeout — if OpenCV.js isn't present (dev environment missing the
      // asset), fail fast so callers can fall back to manual-only cropping
      // instead of hanging the UI forever.
      setTimeout(() => {
        if (!(window.cv && window.cv.Mat)) {
          this.loadingPromise = null;
          reject(new Error('OpenCV.js initialization timed out'));
        }
      }, 12000);
    });

    return this.loadingPromise;
  }

  get isLoaded(): boolean {
    return !!(window.cv && window.cv.Mat);
  }
}
