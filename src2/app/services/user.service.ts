import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GoogleSessionService } from '../core/google/session/google-session.service';
import { GoogleUser } from '../core/google/auth/google-auth.models';

export interface UserProfile {
  googleId: string;
  email: string;
  displayName: string;
  photoUrl: any;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {

  constructor(
    private readonly sessionService: GoogleSessionService
  ) {}

  /** Reactive profile stream — emits null when logged out, updates automatically on sign-in/sign-out. */
  readonly profile$: Observable<UserProfile | null> = this.sessionService.session$.pipe(
    map(session => this.toProfile(session.user))
  );

  get currentProfile(): UserProfile | null {
    return this.toProfile(this.sessionService.currentSession.user);
  }

  /** Waits for the persisted session to finish restoring, then returns the profile (or null if not logged in). Use on app boot before reading currentProfile. */
  async restoreProfile(): Promise<UserProfile | null> {
    await this.sessionService.ready;
    return this.currentProfile;
  }

  // Note: no separate clear() — profile derives directly from GoogleSessionService,
  // which GoogleAuthService.signOut() already clears. One source of truth, no duplicate state to forget to reset.

  private toProfile(user: GoogleUser | null): UserProfile | null {

    if (!user) {
      return null;
    }

    return {
      googleId: user.id,
      email: user.email,
      displayName: user.displayName,
      photoUrl: user.imageUrl
    };
  }

}