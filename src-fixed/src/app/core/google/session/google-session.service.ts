import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { GoogleSession } from '../auth/google-auth.models';

const SESSION_STORAGE_KEY = 'google_auth_session';

@Injectable({
  providedIn: 'root'
})
export class GoogleSessionService {

  private readonly sessionSubject = new BehaviorSubject<GoogleSession>({
    isAuthenticated: false,
    user: null
  });

  readonly session$ = this.sessionSubject.asObservable();

  /** Resolves once any persisted session has been loaded into memory. Guards/pages should await this before trusting `currentSession`. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.hydrate();
  }

  get currentSession(): GoogleSession {
    return this.sessionSubject.value;
  }

  updateSession(session: GoogleSession): void {
    this.sessionSubject.next(session);
    this.persist(session);
  }

  clearSession(): void {

    const cleared: GoogleSession = {
      isAuthenticated: false,
      user: null
    };

    this.sessionSubject.next(cleared);

    Preferences.remove({ key: SESSION_STORAGE_KEY }).catch(err =>
      console.warn('GoogleSessionService: failed to clear persisted session', err)
    );
  }

  // =====================================
  // PRIVATE
  // =====================================

  private async hydrate(): Promise<void> {

    try {

      const { value } = await Preferences.get({ key: SESSION_STORAGE_KEY });

      if (!value) {
        return;
      }

      const session: GoogleSession = JSON.parse(value);

      if (session?.isAuthenticated && session?.user) {
        this.sessionSubject.next(session);
      }

    } catch (err) {
      console.warn('GoogleSessionService: failed to restore persisted session', err);
    }
  }

  private persist(session: GoogleSession): void {

    Preferences.set({
      key: SESSION_STORAGE_KEY,
      value: JSON.stringify(session)
    }).catch(err =>
      console.warn('GoogleSessionService: failed to persist session', err)
    );
  }

}