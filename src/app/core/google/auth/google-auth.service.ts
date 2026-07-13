import { Injectable } from '@angular/core';
import { OAuth2Client } from '@byteowls/capacitor-oauth2';
import { GoogleSessionService } from '../session/google-session.service';
import { GoogleUser } from './google-auth.models';
import { googleOAuthConfig } from './google-oauth.config';

@Injectable({
  providedIn: 'root'
})
export class GoogleAuthService {

  constructor(
    private readonly sessionService: GoogleSessionService
  ) {}

  async signIn(): Promise<GoogleUser> {

    const response: any = await OAuth2Client.authenticate(googleOAuthConfig);

    const googleUser = this.mapResponseToUser(response);

    this.sessionService.updateSession({
      isAuthenticated: true,
      user: googleUser
    });

    return googleUser;

  }

  async signOut(): Promise<void> {

    try {
      await OAuth2Client.logout(googleOAuthConfig);
    } catch (err) {
      // logout can throw if there's no active native session — safe to ignore
      console.warn('OAuth2Client.logout warning:', err);
    }

    this.sessionService.clearSession();

  }

  async restoreSession(): Promise<boolean> {

    return this.sessionService.currentSession.isAuthenticated;

  }

  private mapResponseToUser(response: any): GoogleUser {

    // @byteowls/capacitor-oauth2 spreads the resourceUrl (userinfo) fields
    // directly onto the response object alongside the token fields.
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

}