import { Injectable } from '@angular/core';
import { Observable, combineLatest, map } from 'rxjs';
import { GoogleSessionService } from '../core/google/session/google-session.service';
import { GoogleUser } from '../core/google/auth/google-auth.models';
import { AvatarOverrideService } from './avatar-override.service';
import { NicknameOverrideService } from './nickname-override.service';

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
    private readonly sessionService: GoogleSessionService,
    private readonly avatarOverride: AvatarOverrideService,
    private readonly nicknameOverride: NicknameOverrideService
  ) {
    this.avatarOverride.ensureLoaded();
    this.nicknameOverride.ensureLoaded();
  }

  /** Reactive profile stream — emits null when logged out, updates automatically on sign-in/sign-out or when the local avatar/nickname override changes. */
  readonly profile$: Observable<UserProfile | null> = combineLatest([
    this.sessionService.session$,
    this.avatarOverride.override$,
    this.nicknameOverride.override$
  ]).pipe(
    map(([session, avatarOverride, nicknameOverride]) =>
      this.toProfile(session.user, avatarOverride, nicknameOverride))
  );

  get currentProfile(): UserProfile | null {
    return this.toProfile(
      this.sessionService.currentSession.user,
      this.avatarOverride.current,
      this.nicknameOverride.current
    );
  }

  /** Waits for the persisted session to finish restoring, then returns the profile (or null if not logged in). Use on app boot before reading currentProfile. */
  async restoreProfile(): Promise<UserProfile | null> {
    await this.sessionService.ready;
    await this.avatarOverride.ensureLoaded();
    await this.nicknameOverride.ensureLoaded();
    return this.currentProfile;
  }

  // Note: no separate clear() — profile derives directly from GoogleSessionService,
  // which GoogleAuthService.signOut() already clears. One source of truth, no duplicate state to forget to reset.

  private toProfile(
    user: GoogleUser | null,
    avatarOverride: string | null,
    nicknameOverride: string | null
  ): UserProfile | null {

    if (!user) {
      return null;
    }

    return {
      googleId: user.id,
      email: user.email,
      displayName: nicknameOverride || user.displayName,
      photoUrl: avatarOverride || user.imageUrl
    };
  }

}
