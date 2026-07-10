import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GoogleSession } from '../auth/google-auth.models';

@Injectable({
  providedIn: 'root'
})
export class GoogleSessionService {

  private readonly sessionSubject = new BehaviorSubject<GoogleSession>({
    isAuthenticated: false,
    user: null
  });

  readonly session$ = this.sessionSubject.asObservable();

  get currentSession(): GoogleSession {
    return this.sessionSubject.value;
  }

  updateSession(session: GoogleSession): void {
    this.sessionSubject.next(session);
  }

  clearSession(): void {
    this.sessionSubject.next({
      isAuthenticated: false,
      user: null
    });
  }
}