import { Injectable } from '@angular/core';
import { GoogleSessionService } from '../session/google-session.service';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { GoogleUser } from './google-auth.models';
@Injectable({
  providedIn: 'root'
})
export class GoogleAuthService {

  constructor(
    private readonly sessionService: GoogleSessionService
  ) {  GoogleAuth.initialize();
}

async signIn(): Promise<GoogleUser> {

  const user = await GoogleAuth.signIn();

  const googleUser: GoogleUser = {
    id: user.id,
    email: user.email,
    displayName: user.name,
    givenName: user.givenName,
    familyName: user.familyName,
    imageUrl: user.imageUrl,
    idToken: user.authentication.idToken,
    accessToken: user.authentication.accessToken
  };

  this.sessionService.updateSession({
    isAuthenticated: true,
    user: googleUser
  });

  return googleUser;
}

async signOut(): Promise<void> {

  await GoogleAuth.signOut();

  this.sessionService.clearSession();

}

async restoreSession(): Promise<boolean> {
  try {
    await GoogleAuth.refresh();

    return true;

  } catch {
    this.sessionService.clearSession();
    return false;
  }
}
}