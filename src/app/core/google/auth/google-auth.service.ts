import { Injectable } from '@angular/core';
import { OAuth2Client } from '@byteowls/capacitor-oauth2';
import { Preferences } from '@capacitor/preferences';
import { GoogleSessionService } from '../session/google-session.service';
import { GoogleUser } from './google-auth.models';
import { googleOAuthConfig } from './google-oauth.config';
import { NotificationService } from '../../../services/notification.service';

const REFRESH_TOKEN_KEY = 'google_auth_refresh_token';

@Injectable({
  providedIn: 'root'
})
export class GoogleAuthService {

  isLoading = false;
  lastError: string | null = null;

  constructor(
    private readonly sessionService: GoogleSessionService,
    private readonly notificationService: NotificationService
  ) {}

  // =====================================
  // SIGN IN
  // =====================================

  async signIn(): Promise<GoogleUser> {

    this.isLoading = true;
    this.lastError = null;

    try {

      const response: any = await OAuth2Client.authenticate(googleOAuthConfig);

      const googleUser = this.mapResponseToUser(response);

      await this.storeRefreshToken(response);

      this.sessionService.updateSession({
        isAuthenticated: true,
        user: googleUser
      });

      return googleUser;

    } catch (err: any) {

      this.lastError = this.mapError(err);
      throw err;

    } finally {

      this.isLoading = false;

    }
  }

  // =====================================
  // SIGN OUT
  // =====================================

  async signOut(): Promise<void> {

    try {
      await OAuth2Client.logout(googleOAuthConfig);
    } catch (err) {
      // logout can throw if there's no active native session — safe to ignore
      console.warn('OAuth2Client.logout warning:', err);
    }

    await Preferences.remove({ key: REFRESH_TOKEN_KEY });

    this.sessionService.clearSession();

  }

  // =====================================
  // SESSION RESTORE
  // =====================================

  /** Waits for the persisted session to finish loading, then reports auth state. Safe to call on every app boot / guard check. */
  async restoreSession(): Promise<boolean> {
    await this.sessionService.ready;
    return this.sessionService.currentSession.isAuthenticated;
  }

  // =====================================
  // CURRENT USER
  // =====================================

  get currentUser(): GoogleUser | null {
    return this.sessionService.currentSession.user;
  }

  // =====================================
  // REFRESH TOKEN
  // =====================================

  async refreshAccessToken(): Promise<string | null> {

    const { value: refreshToken } = await Preferences.get({ key: REFRESH_TOKEN_KEY });

    if (!refreshToken) {
      console.warn('No refresh token stored — user must sign in again');
      this.notificationService.authSessionExpired();
      return null;
    }

    try {

      const androidConfig: any = (googleOAuthConfig as any).android;

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: androidConfig?.appId ?? '',
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }).toString()
      });

      if (!res.ok) {
        throw new Error(`Refresh failed with status ${res.status}`);
      }

      const data = await res.json();

      return data.access_token ?? null;

    } catch (err) {

      console.error('❌ Token refresh failed:', err);
      this.lastError = 'Session expired — please sign in again';
      this.notificationService.authSessionExpired();
      return null;

    }
  }

  // =====================================
  // PRIVATE HELPERS
  // =====================================

  private async storeRefreshToken(response: any): Promise<void> {

    const refreshToken = response?.access_token_response?.refresh_token
      ?? response?.refresh_token;

    if (refreshToken) {
      await Preferences.set({ key: REFRESH_TOKEN_KEY, value: refreshToken });
    }
  }

  private mapResponseToUser(response: any): GoogleUser {

    const accessToken = response?.access_token_response?.access_token
      ?? response?.access_token
      ?? '';

    const idToken = response?.access_token_response?.id_token
      ?? response?.id_token
      ?? '';

    return {
      id: response?.id ?? response?.sub ?? '',
      email: response?.email ?? '',
      displayName: response?.name ?? '',
      givenName: response?.given_name ?? '',
      familyName: response?.family_name ?? '',
      imageUrl: response?.picture ?? '',
      idToken,
      accessToken
    };

  }

  private mapError(err: any): string {

    const message = err?.message || err?.error || String(err);

    if (message.includes('USER_CANCELLED')) {
      return 'Sign-in was cancelled';
    }

    if (message.includes('redirect_uri_mismatch')) {
      return 'Google sign-in is misconfigured. Please contact support.';
    }

    return 'Google sign-in failed. Please try again.';

  }

}