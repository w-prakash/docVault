import { Injectable } from '@angular/core';
import { GoogleDriveAuthService } from './google-drive-auth.service';
import {
  DriveApiError,
  DriveAuthError,
  DriveFile,
  DriveFileList,
  DriveOfflineError,
  DriveUploadMetadata
} from './google-drive.models';

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

@Injectable({
  providedIn: 'root'
})
export class GoogleDriveService {

  constructor(
    private readonly driveAuth: GoogleDriveAuthService
  ) {}

  get<T = any>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', this.withParams(path, params));
  }

  post<T = any>(path: string, body?: any, params?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', this.withParams(path, params), body);
  }

  patch<T = any>(path: string, body: any, params?: Record<string, string>): Promise<T> {
    return this.request<T>('PATCH', this.withParams(path, params), body);
  }

  delete(path: string, params?: Record<string, string>): Promise<void> {
    return this.request<void>('DELETE', this.withParams(path, params));
  }

  listFiles(query: string, pageToken?: string): Promise<DriveFileList> {

    const params: Record<string, string> = {
      q: query,
      fields: 'nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink, webContentLink, trashed, appProperties)',
      pageSize: '50'
    };

    if (pageToken) {
      params['pageToken'] = pageToken;
    }

    return this.get<DriveFileList>('/files', params);
  }

  getFile(fileId: string): Promise<DriveFile> {
    return this.get<DriveFile>(`/files/${fileId}`, {
      fields: 'id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink, webContentLink, trashed, appProperties'
    });
  }

  createFolder(name: string, parentId?: string): Promise<DriveFile> {

    return this.post<DriveFile>('/files', {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    });
  }

  deleteFile(fileId: string): Promise<void> {
    return this.delete(`/files/${fileId}`);
  }

  /**
   * Google's storage quota is per-account (shared across Gmail/Photos/Drive),
   * not per-app-folder — there's no API for "how much of MY quota does
   * DocVault's folder use." Callers should label this as account storage,
   * not DocVault-specific storage.
   */
  getAbout(): Promise<{
    storageQuota?: {
      limit?: string;
      usage?: string;
      usageInDrive?: string;
      usageInDriveTrash?: string;
    };
  }> {
    return this.get('/about', { fields: 'storageQuota' });
  }

  uploadMultipart(
    file: Blob,
    metadata: DriveUploadMetadata,
    onProgress?: (percent: number) => void
  ): Promise<DriveFile> {

    this.assertOnline();

    return this.withAuthRetry((accessToken) =>
      this.withRetry(async () => {

        const boundary = `docvault-${Date.now()}`;
        const body = await this.buildMultipartBody(file, metadata, boundary);

        return this.xhrRequest<DriveFile>({
          method: 'POST',
          url: `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,parents,size,createdTime,modifiedTime,webViewLink,webContentLink,appProperties`,
          accessToken,
          body,
          contentType: `multipart/related; boundary=${boundary}`,
          onProgress
        });

      })
    );
  }

  downloadMedia(
    fileId: string,
    onProgress?: (percent: number) => void
  ): Promise<Blob> {

    this.assertOnline();

    return this.withAuthRetry((accessToken) =>
      this.xhrRequest<Blob>({
        method: 'GET',
        url: `${API_BASE}/files/${fileId}?alt=media`,
        accessToken,
        responseType: 'blob',
        onProgress
      })
    );
  }

  private async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: any): Promise<T> {

    this.assertOnline();

    return this.withAuthRetry(async (accessToken) => {

      let attempt = 0;

      while (true) {

        try {

          const res = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: body ? JSON.stringify(body) : undefined
          });

          if (res.status === 401) {
            throw new DriveAuthError('Access token rejected (401)');
          }

          if (!res.ok) {

            const errorBody = await this.safeJson(res);

            if (this.isTransient(res.status) && attempt < MAX_RETRIES) {
              attempt++;
              await this.delay(RETRY_BASE_DELAY_MS * attempt);
              continue;
            }

            throw new DriveApiError(
              errorBody?.error?.message ?? `Drive API request failed (${res.status})`,
              res.status,
              errorBody
            );
          }

          if (res.status === 204 || method === 'DELETE') {
            return undefined as unknown as T;
          }

          return await res.json() as T;

        } catch (err) {

          if (err instanceof DriveAuthError) {
            throw err;
          }

          if (err instanceof DriveApiError) {
            throw err;
          }

          if (attempt < MAX_RETRIES) {
            attempt++;
            await this.delay(RETRY_BASE_DELAY_MS * attempt);
            continue;
          }

          throw new DriveApiError('Network request failed after retries', 0, err);

        }
      }
    });
  }

  private async withAuthRetry<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {

    let accessToken: string;

    try {
      accessToken = this.driveAuth.getAccessToken();
    } catch {
      throw new DriveAuthError('No active Google session — please sign in');
    }

    try {

      return await fn(accessToken);

    } catch (err) {

      if (!(err instanceof DriveAuthError)) {
        throw err;
      }

      const refreshedToken = await this.driveAuth.refreshAccessToken();

      if (!refreshedToken) {
        throw new DriveAuthError('Session expired — please sign in again');
      }

      return await fn(refreshedToken);

    }
  }

  private xhrRequest<T>(opts: {
    method: string;
    url: string;
    accessToken: string;
    body?: XMLHttpRequestBodyInit;
    contentType?: string;
    responseType?: XMLHttpRequestResponseType;
    onProgress?: (percent: number) => void;
  }): Promise<T> {

    return new Promise((resolve, reject) => {

      const xhr = new XMLHttpRequest();

      xhr.open(opts.method, opts.url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${opts.accessToken}`);

      if (opts.contentType) {
        xhr.setRequestHeader('Content-Type', opts.contentType);
      }

      if (opts.responseType) {
        xhr.responseType = opts.responseType;
      }

      if (opts.onProgress) {

        const progressTarget = opts.method === 'GET' ? xhr : xhr.upload;

        progressTarget.onprogress = (event) => {
          if (event.lengthComputable) {
            opts.onProgress!(Math.round((event.loaded / event.total) * 100));
          }
        };
      }

      xhr.onload = () => {

        if (xhr.status === 401) {
          reject(new DriveAuthError('Access token rejected (401)'));
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new DriveApiError(`Drive request failed (${xhr.status})`, xhr.status, xhr.response));
          return;
        }

        if (opts.responseType === 'blob') {
          resolve(xhr.response as T);
          return;
        }

        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          resolve(xhr.response as T);
        }
      };

      xhr.onerror = () => reject(new DriveApiError('Network error during upload/download', 0));

      xhr.send(opts.body);

    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {

    let attempt = 0;

    while (true) {

      try {

        return await fn();

      } catch (err) {

        if (err instanceof DriveAuthError) {
          throw err; // handled by withAuthRetry, not here
        }

        const status = err instanceof DriveApiError ? err.status : 0;
        const transient = status === 0 || status === 429 || (status >= 500 && status < 600);

        if (transient && attempt < MAX_RETRIES) {
          attempt++;
          await this.delay(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }

        throw err;

      }
    }
  }

  private assertOnline(): void {
    if (!navigator.onLine) {
      throw new DriveOfflineError();
    }
  }

  private withParams(path: string, params?: Record<string, string>): string {

    if (!params || Object.keys(params).length === 0) {
      return path;
    }

    const query = new URLSearchParams(params).toString();
    return `${path}?${query}`;

  }

  private isTransient(status: number): boolean {
    return status === 429 || (status >= 500 && status < 600);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async safeJson(res: Response): Promise<any> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  private async buildMultipartBody(file: Blob, metadata: DriveUploadMetadata, boundary: string): Promise<Blob> {

    const metadataPart =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n`;

    const filePartHeader =
      `--${boundary}\r\n` +
      `Content-Type: ${metadata.mimeType ?? file.type ?? 'application/octet-stream'}\r\n\r\n`;

    const closing = `\r\n--${boundary}--`;

    return new Blob([metadataPart, filePartHeader, file, closing]);

  }

}