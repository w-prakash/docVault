import { Injectable } from '@angular/core';
import { OpenCvLoaderService } from './opencv-loader.service';
import { ScanAdjustments, ScanCorners, ScanFilterType } from '../models/scanner.models';

@Injectable({ providedIn: 'root' })
export class ImageProcessingService {

  constructor(private cvLoader: OpenCvLoaderService) {}

  // ===================================================================
  // PERSPECTIVE CORRECTION
  // ===================================================================

  /**
   * Warps the quadrilateral defined by `corners` into a flat rectangle,
   * producing the "flattened document" look. Uses OpenCV's perspective
   * transform when available; falls back to a plain crop of the
   * bounding box (no de-skew) if OpenCV failed to load, so the flow
   * never dead-ends.
   */
  async perspectiveCorrect(imageEl: HTMLImageElement, corners: ScanCorners): Promise<string> {

    const { topLeft, topRight, bottomLeft, bottomRight } = corners;

    const widthTop = this.distance(topLeft, topRight);
    const widthBottom = this.distance(bottomLeft, bottomRight);
    const heightLeft = this.distance(topLeft, bottomLeft);
    const heightRight = this.distance(topRight, bottomRight);

    const outputWidth = Math.max(1, Math.round(Math.max(widthTop, widthBottom)));
    const outputHeight = Math.max(1, Math.round(Math.max(heightLeft, heightRight)));

    let cv: any;
    try {
      cv = await this.cvLoader.load();
    } catch {
      return this.fallbackCrop(imageEl, corners, outputWidth, outputHeight);
    }

    let src: any, dst: any, srcTri: any, dstTri: any, M: any;

    try {
      src = cv.imread(imageEl);
      dst = new cv.Mat();

      srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        topLeft.x, topLeft.y,
        topRight.x, topRight.y,
        bottomRight.x, bottomRight.y,
        bottomLeft.x, bottomLeft.y,
      ]);

      dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        outputWidth, 0,
        outputWidth, outputHeight,
        0, outputHeight,
      ]);

      M = cv.getPerspectiveTransform(srcTri, dstTri);

      cv.warpPerspective(
        src, dst, M,
        new cv.Size(outputWidth, outputHeight),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar()
      );

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      cv.imshow(canvas, dst);

      return canvas.toDataURL('image/jpeg', 0.92);

    } catch (e) {
      console.error('❌ Perspective correction failed — falling back to crop', e);
      return this.fallbackCrop(imageEl, corners, outputWidth, outputHeight);
    } finally {
      src?.delete();
      dst?.delete();
      srcTri?.delete();
      dstTri?.delete();
      M?.delete();
    }
  }

  private fallbackCrop(imageEl: HTMLImageElement, corners: ScanCorners, w: number, h: number): string {
    const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomLeft.x, corners.bottomRight.x];
    const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomLeft.y, corners.bottomRight.y];
    const minX = Math.max(0, Math.min(...xs));
    const minY = Math.max(0, Math.min(...ys));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imageEl, minX, minY, w, h, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ===================================================================
  // ROTATION
  // ===================================================================

  async rotate(dataUrl: string, degrees: 0 | 90 | 180 | 270): Promise<string> {
    if (degrees === 0) return dataUrl;

    const img = await this.loadImage(dataUrl);
    const swap = degrees === 90 || degrees === 270;

    const canvas = document.createElement('canvas');
    canvas.width = swap ? img.naturalHeight : img.naturalWidth;
    canvas.height = swap ? img.naturalWidth : img.naturalHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // ===================================================================
  // FILTERS + ENHANCEMENT (shadow/noise removal, readability boost)
  // ===================================================================

  /**
   * Applies the chosen filter, then layers manual brightness/contrast/
   * sharpness adjustments on top. Runs entirely on a <canvas> with
   * pixel-level math — no extra dependency needed for this stage.
   */
  async applyFilterAndAdjustments(
    dataUrl: string,
    filter: ScanFilterType,
    adjustments: ScanAdjustments
  ): Promise<string> {

    const img = await this.loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    switch (filter) {
      case 'original':
        break;
      case 'color':
        imageData = this.autoWhiteBalance(imageData);
        break;
      case 'enhanced':
        imageData = this.removeShadows(imageData);
        imageData = this.contrastStretch(imageData);
        imageData = this.sharpen(imageData, 30);
        break;
      case 'magicColor':
        imageData = this.removeShadows(imageData);
        imageData = this.autoWhiteBalance(imageData);
        imageData = this.saturate(imageData, 1.25);
        imageData = this.contrastStretch(imageData);
        break;
      case 'grayscale':
        imageData = this.grayscale(imageData);
        break;
      case 'blackAndWhite':
        imageData = this.grayscale(imageData);
        imageData = this.removeShadows(imageData);
        imageData = this.adaptiveThreshold(imageData);
        break;
      case 'highContrast':
        imageData = this.grayscale(imageData);
        imageData = this.contrastStretch(imageData, 1.6);
        break;
    }

    if (adjustments.brightness !== 0) {
      imageData = this.brightness(imageData, adjustments.brightness);
    }
    if (adjustments.contrast !== 0) {
      imageData = this.contrast(imageData, adjustments.contrast);
    }
    if (adjustments.sharpness > 0) {
      imageData = this.sharpen(imageData, adjustments.sharpness);
    }

    ctx.putImageData(imageData, 0, 0);
    const quality = filter === 'blackAndWhite' || filter === 'grayscale' ? 0.85 : 0.92;
    return canvas.toDataURL('image/jpeg', quality);
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ---- pixel-level operations -------------------------------------

  private grayscale(imageData: ImageData): ImageData {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    return imageData;
  }

  private brightness(imageData: ImageData, amount: number): ImageData {
    const d = imageData.data;
    const offset = (amount / 100) * 255;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = this.clamp(d[i] + offset);
      d[i + 1] = this.clamp(d[i + 1] + offset);
      d[i + 2] = this.clamp(d[i + 2] + offset);
    }
    return imageData;
  }

  private contrast(imageData: ImageData, amount: number): ImageData {
    const factor = (259 * (amount + 255)) / (255 * (259 - amount));
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = this.clamp(factor * (d[i] - 128) + 128);
      d[i + 1] = this.clamp(factor * (d[i + 1] - 128) + 128);
      d[i + 2] = this.clamp(factor * (d[i + 2] - 128) + 128);
    }
    return imageData;
  }

  /** Stretches the histogram so the darkest/lightest pixels hit 0/255 — punches up text readability. */
  private contrastStretch(imageData: ImageData, boost = 1.0): ImageData {
    const d = imageData.data;
    let min = 255, max = 0;

    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const range = Math.max(1, max - min);

    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const stretched = ((d[i + c] - min) / range) * 255 * boost;
        d[i + c] = this.clamp(stretched);
      }
    }
    return imageData;
  }

  private saturate(imageData: ImageData, factor: number): ImageData {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      d[i] = this.clamp(gray + (d[i] - gray) * factor);
      d[i + 1] = this.clamp(gray + (d[i + 1] - gray) * factor);
      d[i + 2] = this.clamp(gray + (d[i + 2] - gray) * factor);
    }
    return imageData;
  }

  /**
   * Shadow / uneven-lighting removal via the classic "divide by blurred
   * illumination map" technique: a heavily blurred copy approximates the
   * lighting gradient (shadow), dividing the original by it flattens
   * lighting so the page reads as a uniform white background.
   */
  private removeShadows(imageData: ImageData): ImageData {
    const { width, height, data } = imageData;
    const illumination = this.boxBlur(data, width, height, Math.max(15, Math.round(Math.min(width, height) * 0.04)));

    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const bg = Math.max(1, illumination[i + c]);
        const normalized = (data[i + c] / bg) * 255;
        out[i + c] = this.clamp(normalized);
      }
      out[i + 3] = data[i + 3];
    }
    return new ImageData(out, width, height);
  }

  /** Simple separable box blur — used as the illumination estimate and as a light denoiser. */
  private boxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(data.length);
    const r = Math.max(1, radius);

    // Horizontal pass
    const temp = new Float32Array(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let dx = -r; dx <= r; dx += Math.max(1, Math.floor(r / 4))) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const idx = (y * width + nx) * 4;
          rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2];
          count++;
        }
        const idx = (y * width + x) * 4;
        temp[idx] = rSum / count; temp[idx + 1] = gSum / count; temp[idx + 2] = bSum / count;
      }
    }

    // Vertical pass
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let dy = -r; dy <= r; dy += Math.max(1, Math.floor(r / 4))) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          const idx = (ny * width + x) * 4;
          rSum += temp[idx]; gSum += temp[idx + 1]; bSum += temp[idx + 2];
          count++;
        }
        const idx = (y * width + x) * 4;
        out[idx] = this.clamp(rSum / count);
        out[idx + 1] = this.clamp(gSum / count);
        out[idx + 2] = this.clamp(bSum / count);
        out[idx + 3] = 255;
      }
    }

    return out;
  }

  /** Gray-world auto white balance — neutralizes color casts from indoor/warm lighting. */
  private autoWhiteBalance(imageData: ImageData): ImageData {
    const d = imageData.data;
    let rTotal = 0, gTotal = 0, bTotal = 0, n = 0;

    for (let i = 0; i < d.length; i += 4) {
      rTotal += d[i]; gTotal += d[i + 1]; bTotal += d[i + 2];
      n++;
    }

    const rAvg = rTotal / n, gAvg = gTotal / n, bAvg = bTotal / n;
    const gray = (rAvg + gAvg + bAvg) / 3;

    const rGain = gray / Math.max(1, rAvg);
    const gGain = gray / Math.max(1, gAvg);
    const bGain = gray / Math.max(1, bAvg);

    for (let i = 0; i < d.length; i += 4) {
      d[i] = this.clamp(d[i] * rGain);
      d[i + 1] = this.clamp(d[i + 1] * gGain);
      d[i + 2] = this.clamp(d[i + 2] * bGain);
    }
    return imageData;
  }

  /** Local-ish adaptive threshold approximation for crisp black-and-white text scans. */
  private adaptiveThreshold(imageData: ImageData): ImageData {
    const { width, height, data } = imageData;
    const blurred = this.boxBlur(data, width, height, Math.max(10, Math.round(Math.min(width, height) * 0.03)));
    const out = new Uint8ClampedArray(data.length);

    for (let i = 0; i < data.length; i += 4) {
      const localMean = blurred[i];
      const v = data[i] < localMean - 8 ? 0 : 255;
      out[i] = out[i + 1] = out[i + 2] = v;
      out[i + 3] = 255;
    }
    return new ImageData(out, width, height);
  }

  /** Unsharp-mask style sharpening — strengthens text edges for readability. */
  private sharpen(imageData: ImageData, amount: number): ImageData {
    const { width, height, data } = imageData;
    const strength = amount / 100;
    if (strength <= 0) return imageData;

    const src = new Uint8ClampedArray(data);
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0, k = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += src[idx] * kernel[k++];
            }
          }
          const idx = (y * width + x) * 4 + c;
          data[idx] = this.clamp(src[idx] * (1 - strength) + sum * strength);
        }
      }
    }
    return imageData;
  }

  private clamp(v: number): number {
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }
}
