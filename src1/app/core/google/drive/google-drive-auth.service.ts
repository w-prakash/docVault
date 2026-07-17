import { Injectable } from '@angular/core';
import { GoogleAuthService } from '../auth/google-auth.service';

/**
 * Narrow responsibility: hand GoogleDriveService a usable access token,
 * and know how to refresh one when it expires. Kept separate from
 * GoogleAuthService (sign-in/session ownership) per single-responsibility.
 */
@Injectable({
  providedIn: 'root'
})
export class GoogleDriveAuthService {

  constructor(
    private readonly googleAuthService: GoogleAuthService
  ) {}

  /** Returns the current access token. Throws if there's no active session. */
  getAccessToken(): string {

    const token = this.googleAuthService.currentUser?.accessToken;

    if (!token) {
      throw new Error('DRIVE_AUTH_REQUIRED: No active Google session');
    }

    return token;

  }

  /** Refreshes the access token and updates the stored session. Returns null if refresh isn't possible. */
  async refreshAccessToken(): Promise<string | null> {
    return this.googleAuthService.refreshAccessToken();
  }

}