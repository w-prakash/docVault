import { Injectable } from '@angular/core';
import { OpenCvLoaderService } from './opencv-loader.service';
import { ScanCorners, ScanPoint, createEmptyCorners } from '../models/scanner.models';

export interface DetectionResult {
  corners: ScanCorners;
  /** False whenever we fell back to the inset default rectangle — lets the
   * caller tell the user detection didn't actually find the document. */
  detected: boolean;
}

@Injectable({ providedIn: 'root' })
export class DocumentDetectionService {

  constructor(private cvLoader: OpenCvLoaderService) {}

  /**
   * Detects the most likely document quadrilateral in an image.
   * Falls back to a safe inset rectangle if OpenCV isn't available yet
   * or no good quadrilateral contour is found — the user can still drag
   * the corners manually, so detection failure never blocks the flow.
   */
  async detect(imageEl: HTMLImageElement): Promise<DetectionResult> {

    let cv: any;

    try {
      cv = await this.cvLoader.load();
      console.log('🟢 [scan] OpenCV loaded:', !!cv?.Mat);
    } catch (e) {
      console.warn('⚠️ [scan] OpenCV unavailable — using default corners', e);
      return { corners: createEmptyCorners(imageEl.naturalWidth, imageEl.naturalHeight), detected: false };
    }

    const width = imageEl.naturalWidth;
    const height = imageEl.naturalHeight;
    console.log('🟢 [scan] Image size:', width, 'x', height);

    let src: any, gray: any, blurred: any, edged: any, contours: any, hierarchy: any;

    try {
      src = cv.imread(imageEl);
      gray = new cv.Mat();
      blurred = new cv.Mat();
      edged = new cv.Mat();
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

      // Auto Canny (median-based): fixed thresholds (60/160) only work for
      // one specific lighting condition — anything brighter/dimmer than
      // that either floods the edge map with noise or misses the
      // document's edges entirely, which is why detection was unreliable
      // enough to fall back to the near-full-image default constantly.
      // Deriving the thresholds from the image's own median intensity
      // (the standard "auto Canny" technique) adapts to each photo.
      const median = this.medianGray(gray);
      const lower = Math.max(0, 0.66 * median);
      const upper = Math.min(255, 1.33 * median);
      cv.Canny(blurred, edged, lower, upper);
      console.log('🟢 [scan] Auto-Canny thresholds:', lower.toFixed(0), upper.toFixed(0), '(median', median.toFixed(0) + ')');

      // Close small gaps in the edge map so a document's border forms one
      // continuous contour instead of several broken segments.
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.dilate(edged, edged, kernel);
      kernel.delete();

      cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      console.log('🟢 [scan] Contours found:', contours.size());

      let bestQuad: ScanPoint[] | null = null;
      let bestArea = 0;

      // Fallback candidate: the single largest plausible contour, even if
      // approxPolyDP couldn't reduce it to exactly 4 points (busy
      // backgrounds, rounded corners, slight motion blur, etc. all throw
      // off an exact quad match in practice).
      let largestContour: any = null;
      let largestContourArea = 0;

      const imageArea = width * height;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        // Ignore tiny contours (noise) and near-full-frame contours (the
        // photo's own border being picked up rather than the document).
        if (area < imageArea * 0.15 || area > imageArea * 0.98) {
          contour.delete();
          continue;
        }

        if (area > largestContourArea) {
          largestContourArea = area;
          largestContour = contour; // kept alive, deleted below
        }

        const peri = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);

        if (approx.rows === 4 && area > bestArea) {
          bestArea = area;
          bestQuad = [];
          for (let p = 0; p < 4; p++) {
            bestQuad.push({
              x: approx.data32S[p * 2],
              y: approx.data32S[p * 2 + 1],
            });
          }
        }

        approx.delete();

        if (contour !== largestContour) {
          contour.delete();
        }
      }

      console.log('🟢 [scan] Largest contour area:', largestContourArea, '/ image area:', imageArea);

      if (bestQuad) {
        console.log('🟢 [scan] Detected corners (exact quad):', bestQuad);
        largestContour?.delete();
        return { corners: this.orderCorners(bestQuad), detected: true };
      }

      // No exact 4-point contour, but there IS a large plausible document
      // shape — use its rotated bounding rectangle instead of giving up.
      // This is the fix for "crop rectangle covers almost the entire
      // image": previously any non-4-point contour fell straight through
      // to createEmptyCorners' 6%-inset rectangle, which on a real photo
      // (document doesn't fill the frame edge-to-edge) looks exactly like
      // "detection isn't working."
      if (largestContour) {
        const rect = cv.minAreaRect(largestContour);
        const points = cv.RotatedRect.points(rect);
        largestContour.delete();

        const quad: ScanPoint[] = points.map((p: any) => ({ x: p.x, y: p.y }));
        console.log('🟡 [scan] Detected corners (minAreaRect fallback):', quad);
        return { corners: this.orderCorners(quad), detected: true };
      }

      console.log('🔴 [scan] No plausible document contour found — using manual default');
      return { corners: createEmptyCorners(width, height), detected: false };

    } catch (e) {
      console.error('❌ [scan] Document detection failed', e);
      return { corners: createEmptyCorners(width, height), detected: false };
    } finally {
      src?.delete();
      gray?.delete();
      blurred?.delete();
      edged?.delete();
      contours?.delete();
      hierarchy?.delete();
    }
  }

  /** Cheap median-brightness estimate (sampled, not exhaustive) used to auto-tune Canny thresholds. */
  private medianGray(gray: any): number {
    const data = gray.data as Uint8Array;
    const step = Math.max(1, Math.floor(data.length / 2000)); // sample ~2000 px
    const samples: number[] = [];
    for (let i = 0; i < data.length; i += step) samples.push(data[i]);
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? 128;
  }

  /** Sorts 4 arbitrary points into topLeft/topRight/bottomLeft/bottomRight. */
  private orderCorners(points: ScanPoint[]): ScanCorners {
    const sortedByY = [...points].sort((a, b) => a.y - b.y);
    const top = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);

    return {
      topLeft: top[0],
      topRight: top[1],
      bottomLeft: bottom[0],
      bottomRight: bottom[1],
    };
  }
}
