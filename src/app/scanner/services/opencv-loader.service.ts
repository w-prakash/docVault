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

      // Defense in depth: no matter what happens above, this promise is
      // guaranteed to settle exactly once within the timeout window, so a
      // scan can never hang the UI forever even if some other edge case
      // slips through the onReady() logic.
      let settled = false;

      const settleResolve = (cv: any) => {
        if (settled) return;
        settled = true;
        resolve(cv);
      };

      const settleReject = (err: Error) => {
        if (settled) return;
        settled = true;
        this.loadingPromise = null;
        reject(err);
      };

      const existing = document.querySelector(`script[src="${this.scriptUrl}"]`) as HTMLScriptElement | null;

      const onReady = () => {
        // If OpenCV has ALREADY finished initializing by the time the
        // script finishes loading/executing, resolve immediately instead
        // of registering a callback — Emscripten's WASM runtime init can
        // complete synchronously during script execution (fast devices,
        // a cached script, small builds), and onRuntimeInitialized only
        // ever fires once. Registering our handler *after* it already
        // fired meant this promise would never resolve, and the 12s
        // safety timeout below wouldn't catch it either — it only
        // rejects when cv.Mat is still missing, which by then it isn't.
        // This was the permanent-hang bug: capture would succeed and the
        // app would just sit there forever with the editor never opening.
        if (window.cv && window.cv.Mat) {
          settleResolve(window.cv);
          return;
        }

        if (window.cv) {
          window.cv['onRuntimeInitialized'] = () => settleResolve(window.cv);
        } else {
          settleReject(new Error('OpenCV.js loaded but window.cv is undefined'));
        }
      };

      if (existing) {
        // A <script> tag already exists from an earlier call — but it may
        // still be mid-download, not necessarily finished. Calling
        // onReady() immediately would wrongly reject with "window.cv is
        // undefined" just because the network request hasn't completed
        // yet. Only treat it as ready if window.cv is already there;
        // otherwise wait for its own load event like a fresh script would.
        if (window.cv) {
          onReady();
        } else {
          existing.addEventListener('load', onReady, { once: true });
          existing.addEventListener('error', () => {
            settleReject(new Error(`Failed to load OpenCV.js from ${this.scriptUrl}`));
          }, { once: true });
        }
      } else {

        const script = document.createElement('script');
        script.src = this.scriptUrl;
        script.async = true;

        script.onload = onReady;

        script.onerror = () => {
          settleReject(new Error(`Failed to load OpenCV.js from ${this.scriptUrl}`));
        };

        document.body.appendChild(script);
      }

      // Safety timeout — if OpenCV.js isn't present (dev environment missing the
      // asset) or initialization otherwise never completes, fail fast so callers
      // fall back to manual-only cropping instead of hanging the UI forever.
      setTimeout(() => {
        settleReject(new Error('OpenCV.js initialization timed out'));
      }, 12000);
    });

    return this.loadingPromise;
  }

  get isLoaded(): boolean {
    return !!(window.cv && window.cv.Mat);
  }
}
