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
  appProperties?: Record<string, string>;
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface DriveUploadMetadata {
  name: string;
  mimeType?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
}

/** Thrown when a request is attempted while the device has no network connection. */
export class DriveOfflineError extends Error {
  constructor(message = 'No network connection') {
    super(message);
    this.name = 'DriveOfflineError';
  }
}

/** Thrown when the Google session is missing or a token refresh failed. */
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