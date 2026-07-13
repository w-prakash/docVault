export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  trashed?: boolean;
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface DriveUploadMetadata {
  name: string;
  mimeType?: string;
  parents?: string[];
}

/** Thrown when a request is attempted while the device has no network connection. Callers (e.g. a future sync worker) should catch this specifically and defer to an offline queue rather than treating it as a hard failure. */
export class DriveOfflineError extends Error {
  constructor(message = 'No network connection') {
    super(message);
    this.name = 'DriveOfflineError';
  }
}

/** Thrown when the Google session is missing or a token refresh failed — the user needs to sign in again. */
export class DriveAuthError extends Error {
  constructor(message = 'Google Drive authorization failed') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

/** Thrown for any non-2xx response from the Drive API after retries/refresh were exhausted. */
export class DriveApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: any
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}