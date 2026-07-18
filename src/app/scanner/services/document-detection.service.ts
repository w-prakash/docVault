import { Injectable } from '@angular/core';
import { OpenCvLoaderService } from './opencv-loader.service';
import { ScanCorners, ScanPoint, createEmptyCorners } from '../models/scanner.models';

@Injectable({ providedIn: 'root' })
export class DocumentDetectionService {

  constructor(private cvLoader: OpenCvLoaderService) {}

  /**
   * Detects the most likely document quadrilateral in an image.
   * Falls back to a safe inset rectangle if OpenCV isn't available yet
   * or no good quadrilateral contour is found — the user can still drag
   * the corners manually, so detection failure never blocks the flow.
   */
  async detect(imageEl: HTMLImageElement): Promise<ScanCorners> {

    let cv: any;

    try {
      cv = await this.cvLoader.load();
    } catch (e) {
      console.warn('⚠️ OpenCV unavailable — using default corners', e);
      return createEmptyCorners(imageEl.naturalWidth, imageEl.naturalHeight);
    }

    const width = imageEl.naturalWidth;
    const height = imageEl.naturalHeight;

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
      cv.Canny(blurred, edged, 60, 160);

      // Close small gaps in the edge map so a document's border forms one
      // continuous contour instead of several broken segments.
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.dilate(edged, edged, kernel);
      kernel.delete();

      cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let bestQuad: ScanPoint[] | null = null;
      let bestArea = 0;
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
        contour.delete();
      }

      if (!bestQuad) {
        return createEmptyCorners(width, height);
      }

      return this.orderCorners(bestQuad);

    } catch (e) {
      console.error('❌ Document detection failed', e);
      return createEmptyCorners(width, height);
    } finally {
      src?.delete();
      gray?.delete();
      blurred?.delete();
      edged?.delete();
      contours?.delete();
      hierarchy?.delete();
    }
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
